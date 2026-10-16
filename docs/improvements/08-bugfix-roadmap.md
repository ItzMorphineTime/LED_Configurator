# 08 · Phase 2 bug-fix roadmap

| | |
|---|---|
| **Status** | Implementation-ready proposal, revision 3.1 (2026-10-16). **Revision 3.1** applies the cross-spec consistency review (07 §0 C32-C62 and 0.4): `FramingPolicy`'s three named boxes in P2-11c/P2-13g (C34); the ZIP atlas entry `'textures/' + Brand.files.panelIdsPng` (never a literal); one `geometry/TextureBudget.js` with a **wall-wide** panel budget in P2-12d (C38); feature keys absent until their landing commit, so P2-13e writes neither `face_orientation` nor `show_pivot_marker` (C39); `PROJECT_REPLACED` at `ProjectSession.apply` step 8 (C41); `core/typingTarget.js` created by P2-9b as the one owner (C18, C52); P2-13d dropped (B-L24 is 01 T7's and 06 T4a's); the B-L1 decision at Phase 2 kickoff (Q10); the P2-0 amendment commit also rewrites REFACTOR_PLAN §5's Phase 2 list; one harness-only PR series starting with P2-0 (C57); 07 D0's residual edits (§4.3 ids, §5.6 B-L31/B-M11). Revision 3 resolves the review of revision 2: the v2 file and the validator now follow spec 07 §4.2–§4.7 exactly (version string, snake_case, 07 issue shape and codes, no stored `nextSectionId`), with every deliberate difference listed as a 07 amendment (§5.6.1); spec 04 conflicts (atlas name and shipping rule, `mesh.gltf.combinedUV`, authority for P2-7, the UV-9 split); the v2 logo restore order; manifests re-derived from the real output inventory; a standing nondeterminism allowlist; frustum depth units; the post-conversion logo cap; rule sequencing (UI caps before the validator, camera Z in v2); feature gates rebuilt from each sibling's own prerequisites; and the minor items. Nothing here is implemented yet. |
| **Scope** | Phase 2 of `docs/REFACTOR_PLAN.md` §5: every verified defect `B-H1..B-H5`, `B-M1..B-M16`, `B-L1..B-L36` from the verified defect list ([`docs/DEFECTS.md`](../DEFECTS.md)), turned into ordered, separately re-baselined batches. |
| **Binding contract** | `docs/ARCHITECTURE.md`. Module, class, method, event, `Strategies` and `LEGACY_SITES` names below are the ones it defines (§3, §5, §8, §9). Each commit in this roadmap amends ARCHITECTURE.md §8 (and the module entries it names) **in the same commit**, as REFACTOR_PLAN §7 requires. |
| **Legacy reference** | `index.html@cd3fd3f` (`git show cd3fd3f:index.html`). Line numbers below refer to that file. |
| **Prerequisites** | Phase 1 merged (WP10 step I-3 green). The Phase 0 extra scenarios in `tests/regression/scenarios-extra.mjs` (`import_edge`, `logos`, `name_with_panel_ids`, `preview_off_in_pilot`, `pilot_look`, `gizmo_drag`, `preview_resize`) are captured. The Phase 1C steps H1/H2 have been attempted. |
| **Sibling specs** | Features 1–6 (`01`–`06`) and the platform spec `07` in `docs/improvements/`. **§5.6 is the single ownership table**: for every bug id it names the authoritative document and commit. Where a sibling spec says otherwise, §5.6 lists the amendment; §5.6.1 lists every point where this roadmap deliberately differs from spec 07. **Spec 07 §4.2–§4.7 is authoritative for the project file and the validator contract**; this roadmap implements a subset of it (P2-3b, P2-13e) and never defines its own shape. §1.1 says when each feature task may merge, using the prerequisites each sibling spec states for itself. |

---

## 0. Owner-visible fixes first

These are the defects the owner and end users actually notice. All of them land in the **owner-visible block** (P2-0 … P2-7, plus P2-12a/d for memory and P2-8a, which the validator needs), before any lower-priority work. The remaining feature prerequisites follow immediately after it (§1, §1.1).

| # | What users see today | Bug ids (deduplicated) | Batch | After the fix | How the golden master proves it |
|---|---|---|---|---|---|
| 1 | Exported walls look inside-out in Blender, Unreal and Unity. They render black, invisible or back-face-culled from the stage side. On curved walls the shading is wrong. These are the **"inverted normals"**. | B-H1, B-H2 (+ B-L3) | **P2-2** | Every triangle in the viewport, OBJ and glTF faces the stage (+Z). OBJ writes per-vertex `vn` and glTF carries `NORMAL`; both are averaged on curves. | Every `*.obj` / `*.gltf` output changes as expected. Viewport screenshots stay **identical** (materials are unlit and DoubleSide); only the wireframe screenshot may WARN (§6.4). |
| 2 | A shared project JSON can inject HTML or script into the page (**XSS**). Typing `"` in a section name truncates it after a re-render. | B-M4 (+ B-L8, B-L16, B-L21) | **P2-3** | Names render as text. Imports are validated, coerced and clamped, and the corrections are reported. | New `p2_xss_names` scenario: the probe element no longer exists. `import_edge` outputs change. |
| 3 | **Export glTF** silently does nothing on larger walls (`RangeError`). **Export All (ZIP)** dies with no message. The panel-ID PNG throws or writes a 0-byte file for very wide walls, and the viewport panel-ID texture is blank. | B-H3, B-L4 (+ B-L5) | **P2-1** | Exports succeed at any wall size the validator allows. A size the browser cannot render gives a clear message instead of a silent failure. The viewport shows the section colour instead of a blank texture. | `large_wall/panel__export-gltf__…gltf` appears and its console `RangeError` disappears. The `p2_oversize_canvas` dialogs, ZIP and viewport screenshot change. |
| 4 | Turning the camera preview off while in pilot mode **traps the viewport in pilot mode**: orbit stops working and P, Esc and the button only repeat an alert. | B-H4 (+ B-M8) | **P2-4** | Pilot mode exits cleanly, and the safe-distance floor disappears with the preview. | `preview_off_in_pilot` loses the alert. `camera/14_preview_off.screenshot.png` loses the floor. |
| 5 | **Export Safe Distance OBJ** never downloads (`ReferenceError`). | B-M1 (+ B-L29, B-M15) | **P2-5a** (first commit after P2-0), **P2-5b** | The file downloads. Its floor faces +Y and its band is mitred. On concave curves and concave corners the offset is clamped, so no triangle flips; clamped stretches are tinted and counted in the OBJ header (§6.9). Overlaps between opposite walls of U-shaped stages are documented as out of scope (§6.9, Q18). | The `camera` scenario gains `export-safe-distance__safe-distance-floor.obj`. `p2_curved_safe_distance` covers concave, convex, box-corner and 30° concave walls. |
| 6 | Re-importing the JSON inside the ZIP **drops every section offset**, so box and corner walls collapse into a line. Section-mode MTL texture paths don't match the files in the ZIP. | B-M3 (+ B-M2, B-L14, B-L7) | **P2-6** | One serializer and one naming helper. The ZIP round-trips exactly, and MTL paths equal the ZIP entry names. | `box_corner/zipjson_roundtrip__export-json__…json` gets back its 90/90/−90 offsets. |
| 7 | **UV misalignment**: on walls with mixed section heights, panel IDs and LED pixels are squashed on the shorter sections. Combined OBJ UVs overlap. glTF has no UVs at all. | B-M5, B-M6, B-M7 (+ B-L6, B-L18) | **P2-7** | Viewport, OBJ and glTF UVs come from one atlas function that matches `panel-ids.png` (and the ZIP's `textures/panel-ids.png`) pixel for pixel. glTF gains `TEXCOORD_0`. Feature 4 later makes per-section 0..1 the default (Q4). | `mixed/panel_ids_combined.screenshot.png`, combined OBJ `vt` lines and every glTF change as expected. |
| 8 | Dragging a colour picker in panel mode with panel IDs on can exhaust GPU memory: the viewport turns black (**WebGL context loss**). Panel mode also drops logos. | B-H5 (+ B-L12, B-M16, B-L19) | **P2-12a** (only if Phase 1C H1/H2 did not land), **P2-12d** | Textures are disposed on every rebuild. Panel mode with panel IDs uses one texture per section, so memory is bounded, and it shows logos and the label size. | `toggles/09_panelids_panel` changes as expected; the texture probes of §9 criteria 44 and 47. |

**Ordering notes (verified arithmetic).**
- **P2-1 must land before P2-2.**
  - Today `large_wall`'s combined/section glTF buffer is 79,728 bytes.
  - Adding `NORMAL` (P2-2) raises it to **121,056 bytes**. That falls inside the band where the legacy spread encoder starts throwing: 120,000 bytes passes and 130,000 throws (B-H3).
  - Adding `TEXCOORD_0` (P2-7) raises it to 148,608 bytes, which would always throw.
  - So without the encoder fix, the normals fix would make the ZIP export of `large_wall` fail intermittently.
- **P2-5a (B-M1, one line) lands before P2-1a.** P2-1a wraps every export in `#runExport`, which turns uncaught export errors into the M-EXP-1 alert. Without P2-5a first, users would see "Export Safe Distance OBJ failed: downloadBlob is not defined" for about ten days. After P2-5a the floor OBJ downloads with the legacy per-column geometry (faces −Y, B-L29) until P2-5b; this interim is accepted and stated in the P2-5a release note.
- **P2-8a (B-L15 rounding and the sanity caps) lands before P2-3b.** The validator rounds counts and enforces the caps, so the UI must already produce only values the validator accepts unchanged (§3.1, R4).

---

## 1. Summary and user value

**Problem.** Phase 1 deliberately preserves every known defect. Each output-affecting quirk sits behind one `Strategies` switch in `js/legacy/LegacyCompat.js` or one `// LEGACY(B-xx)` tag, and is listed in `LEGACY_SITES` (ARCHITECTURE §8). Phase 2 must remove those defects without losing the golden-master guarantee: every output change must be intentional, reviewed and re-baselined on its own.

**For whom.**
- *Stage designers and VP technicians* export the wall to DCC tools and game engines. They need correct normals, UVs that match the textures, exports that do not fail on big walls, and lossless ZIP round-trips.
- *The public site* is static on GitHub Pages and accepts project files from anyone, so it needs safe import.
- *The owner* needs the Phase 3 features (normals view, section selection and offsets, pivot, UV editor, HDRI, Morph branding) built on correct foundations, not on preserved bugs, and **started as early as their foundations allow** (§1.1).

**What this document delivers.**
1. A **deduplicated defect register**: 57 bug ids collapse into 21 root causes (§2.2).
2. **14 batches** (P2-0 … P2-13). Each card in §10 lists the bug ids, the user-visible effect, the exact `Strategies` key or `LEGACY_SITES` row to change, the harness outputs that change, effort, risk and the features it unblocks.
3. A **repeatable re-baseline procedure** with tooling that fails the build when a fix changes anything it did not declare, or fails to change what it declared, plus a standing, evidence-based allowlist of the harness's known nondeterminism (§8). Sibling specs use the same procedure.
4. An **ownership table** that reconciles this roadmap with specs 01, 04 and 07 (§5.6), the list of deliberate differences from spec 07 (§5.6.1), and **feature start gates per task** (§1.1).

**Batch overview, in merge order** (effort codes: S ≤ 0.5 d, M 1–2 d, L 3–5 d, XL > 5 d; "day" = cumulative batch effort at merge, without the per-commit overhead)

| # | Batch | Theme | Bug ids | Owner-visible | Effort | Risk | Depends on | Merged by day | Unblocks |
|---|---|---|---|---|---|---|---|---|---|
| **Owner-visible block** | | | | | | | | | |
| 1 | P2-0 | Phase 2 tooling, nondeterminism allowlist, new harness scenarios | – | – | L (4 d) | Low | Phase 1 | 4 | everything |
| 2 | P2-5a | Safe-distance OBJ downloads (one line) | B-M1 | ★ broken export | S (0.5 d) | Low | P2-0 | 4.5 | P2-1a (no interim alert) |
| 3 | P2-1 | Exports never fail silently | B-H3, B-L5, B-L4 | ★ crashing exports | M (2 d) | Low | P2-5a | 6.5 | P2-2, P2-7; F1, F4 |
| 4 | P2-2 | Stage-facing winding and real normals | B-H1, B-H2, B-L3 | ★ normals | M (2 d) | Med | P2-1 | 8.5 | F1 (T1, T3–T8); F5 (soft) |
| 5 | P2-8a | Integer counts and sanity caps in the UI rules | B-L15 | – | S (0.5 d) | Low | P2-0 | 9 | P2-3b (validator), F2 |
| 6 | P2-3 | Safe import and HTML (07 D7, and the wall subset of 07 D2/D3) | B-M4, B-L8, B-L16, B-L21 | ★ XSS | L (4 d) | Med | P2-8a | 13 | F1 (T9), F2, F3 (T7), F6 (T8) |
| 7 | P2-4 | Preview-off is clean | B-H4, B-M8 | ★ stuck pilot | S (0.5 d) | Low | P2-0 | 13.5 | F5 (soft) |
| 8 | P2-5b | Mitred, clamped safe-distance band | B-L29, B-M15 | ★ broken export | M (2 d) | Low–Med | P2-5a | 15.5 | F1 (T9), F2 (soft), F3 |
| 9 | P2-6 | Consistent, lossless bundles | B-M3, B-L14, B-L7, B-M2 | ★ ZIP drops offsets | M (1.5 d) | Low | P2-3 | 17 | F4, P2-13e |
| 10 | P2-12a, P2-12d | Memory: disposal and panel-mode textures | B-H5, B-L12 (if 1C did not land them), B-M16, B-L19 | ★ context loss | M (2 d) | Med | P2-1 | 19 | F4 (UV-9), F5 |
| 11 | P2-7 | UVs match textures | B-M5, B-M6, B-M7, B-L6, B-L18 | ★ UV misalignment | L (4 d) | Med | P2-1, P2-2, P2-6; owner Q4/Q5 | 23 | F4, F5 (soft, bake) |
| **Feature-gate block** | | | | | | | | | |
| 12 | P2-8b–d | Numeric input semantics | B-L9, B-L10 (pilot half), B-L13 | – | M (1 d) | Low | P2-8a | 24 | P2-13e |
| 13 | P2-9a–d | Click-select, shortcut filters, gizmo sign, prop axes | B-M14, B-L11, B-M12, B-L22 | – | M (2 d) | Med | P2-8c; owner Q6 | 26 | F2, F4 (B-L11) |
| 14 | P2-13a | Logo guards, sanitising, post-conversion cap | B-L35 | – | M (1.5 d) | Low | P2-3 | 27.5 | P2-13e |
| 15 | P2-13e | Project file v2: 07 §4.2 file and ZIP variants (07 D4 subset) | B-L31 | – | XL (7.5 d) | Med | P2-3, P2-6, P2-8b–d, P2-13a | 35 | F2, F3 (T7), F4, F5 (T8), F6 (T8, T10), F1 (persistence) |
| **Remainder** | | | | | | | | | |
| 16 | P2-9e–j | Gizmo local space, quaternion rotation, pilot movement, presets in pilot | B-L23, B-L28, B-M13, B-L27, B-L25, B-L26 | – | M (2 d) | Med | P2-9a–d | 37 | F2, F5 (soft) |
| 17 | P2-10 | Preview window | B-M11, B-M9, B-L32, B-L34 | – | M (2 d) | Low–Med | P2-4 | 39 | F3 (step C), F5 (superseded by 07 R1/R2) |
| 18 | P2-11 | True framing and coverage | B-M10, B-L33, B-L2, B-L10 (Z half) | – | L (3.5 d) | Med | P2-10; co-scheduled with F3 | 42.5 | F1 (soft), F2 (soft), F3 (= step F) |
| 19 | P2-12b, P2-12c | Texture cache LRU, pose-only refresh | B-L20, B-L30 | – | M (1 d) | Med | P2-11 | 43.5 | F5 (soft) |
| 20 | P2-13b, c, f, g | Wall texture warning, toggle accessibility, curve-convention code, clean-up | B-L17, B-L36, B-L1 | – | L (3 d) | Low–Med | P2-7, P2-11 | 46.5 | – (P2-13g after F1-5 and F3 step A, §4.1) |

**Total: 46.5 days of batch work plus about 9.5 days of per-commit gate overhead, about 56 engineering days (XL).**
- *Per-commit overhead.* About 62 commits. The harness measured 3.22 min for today's 19 scenarios; the 8 `p2_*` scenarios add roughly 40–60 %, so a full run takes about 4.5–5 min. Each commit needs up to 3 full runs (about 15 min of machine time, about 15 h in total), plus about 1 h of human work: writing the expected manifest by grepping the parent's outputs (§8.5), reviewing every expected diff, the ARCHITECTURE §8 amendment and the commit message. 62 × ~1.25 h ≈ 9.5 days. Multiply the "merged by day" column by about 1.2 to include it.
- *The owner-visible block* is about 23 days (about 27.5 with overhead).
- *Parallel tracks and path A (07 C58).* Spec 07's rendering track R1 → R2 → R3 runs in parallel right after Phase 1; if it lands first it takes over P2-10a/b and moves P2-10c into `PreviewPass` (07 C31). With the recommended path A (02 Q26), P2-9e–j is pulled forward into the feature-gate block, directly after P2-9a–d, so 07 I1 → I2 → I3 can follow at once (before F2's gizmo work and 04 UV-12/13). P2-0 is also the first commit of the harness-only PR series of §8.2 (07 C57).
- *P2-13d* (the B-L24 fallback) is dropped (07 C52): `.view-btn.active` is 01 T7's and the badge stacking 06 T4a's. The remainder keeps its 3 d estimate.

### 1.1 Feature start gates

**Rule.** Phase 3 does not wait for the end of Phase 2. A feature branch may start development at any time against the designs fixed here; **each feature task merges as soon as its own hard gates have merged**. Phase 2 commits and feature commits then interleave on `main`, still one merge at a time, each through the §8.1 gate.

**Source of the gates.** Every row below is copied from the prerequisites the sibling spec states for itself (its header, its §2.3/§2.4 and its task table), translated into this roadmap's commit ids. Where a sibling allows a spec-07 task as an alternative ("path A"), both are named; whichever lands first satisfies the gate. Gates are listed **per task group**, because most features have parts that need nothing from Phase 2.

| Feature: task group (sibling spec) | Hard gates in this roadmap | Hard gates in spec 07 (or the sibling's fallback) | Soft gates (degrade gracefully) | Merge-ready from day (≈ with overhead) |
|---|---|---|---|---|
| **F6** T1–T7, T9: tokens, CSS, header, fonts, palette, export strings, filenames (06 header; 06 T11 is dropped, 07 C52) | none | none | P2-3a (escaped templates) | **0**: right after Phase 1 (T4b also needs the owner's OK to publish the brand files) |
| **F6** T8 (v1 legacy colour fill) and the persistence half of T10 | P2-3b (`migrateV1toV2`, which reads `palette.legacySectionColors ?? palette.sectionColors`), P2-13e (writer) | 07 D3/D4; in this plan P2-3b and P2-13e implement their Phase-2 subsets (§5.6) | – | 35 (≈ 42) |
| **F1** T2 (`rects` on `--expect` manifest entries, `measure-rects`; the second commit of the harness-only PR series, §8.2) | P2-0 | – | – | 4 (≈ 5) |
| **F1** T1, T3–T8: checker tests, normal lines, debug shading, controls (01 task table; 01's header lists P2-3b and P2-5b for the feature as a whole, but only T9 uses them) | P2-0, P2-1a, P2-2a–d | none | – | 8.5 (≈ 10) |
| **F1** T9–T10: LED side, front-side material | the above + P2-3b, P2-5b | none | P2-13e (the v2 writer that 01 T9b extends with `face_orientation`; P2-13e itself never writes the key, 07 C39), P2-11 (coverage σ) | 15.5 (≈ 18.5) |
| **F3** every task except T7 and step C (03 header: "Only T7 actually depends on them") | none | none | P2-8 (ordering only, 03 header), P2-11c (= 03 step F) | **0** |
| **F3** step C (marker visible by default) | P2-10a | or 07 R1 | – | 39 (≈ 47), or when 07 R1 lands |
| **F3** T7 (persistence, step A′) | P2-3b, P2-13e | or 07 D2 + D5 | – | 35 (≈ 42) |
| **F5** every task except T8 (05 header) | P2-12a only if Phase 1C H1 did not land | 07 R1 + R2; **07 R3 is hard for T4 onward** (07 C55; 05 r3 deleted its path-B T0) | P2-2 (lit materials), P2-4, P2-10 (superseded by 07 R1/R2), P2-7c (bake, T13), I1–I3, E1 | independent of this roadmap once 07 R1-R3 land |
| **F5** T8 (persistence) | P2-13e | 07 D4 + D6 (`AssetStore`) | – | after P2-13e (35) and 07 D6 |
| **F2** 3a: picking, multi-select, offsets, gizmo, v2 fields (02 header) | P2-3b (B-L8), P2-8a (B-L15), P2-9a (B-M14), P2-9b (B-L11), P2-9c (B-M12), P2-13e (B-L31); 02 T3 also needs the **recorded** B-L1 decision (Q10: **kept**, recorded 2026-10-16), not P2-13f's code | or 07 D2, I1, I2, I3, D4 (02 path A, the recommended path, 07 C58) | P2-5b (the band builder over one polyline; Feature 2 adds `floorRuns()` and calls it once per run, 02 §6.12, CR-08-a), P2-9d (`allowedAxes`; 02 adds the typedef itself if missing), P2-11 (true bounds) | 35 (≈ 42) |
| **F2** 3b extras | as 3a | 07 H1 (undo rows) | – | after 3a and 07 H1 |
| **F4** UV-5 onward (04 §2.3 and its critical path "08 P2-7 and P2-13e → UV-5 → …") | P2-1, P2-6, P2-7a–f, P2-9b (B-L11), P2-13e; UV-9 also P2-12d | 07 D5 (`ProjectSchema`, `ProjectValidator` hooks) | – | after P2-13e (35) and 07 D5 |

**What this means for the owner's requests.**
- **Branding (F6)** is not held back by Phase 2 at all: tokens, header, fonts, palette and filenames can merge right after Phase 1. Only the JSON `generator` field and the persisted brand-mark toggle wait for the v2 writer (P2-13e).
- **Normals (F1)**: the flip itself is P2-2 (day 8.5); the debug view can merge right after it; the per-section LED side waits for the clamped band (P2-5b, day 15.5).
- **Pivot (F3)** can merge immediately except its persistence and its default-visible marker.
- **Section editing (F2)** and the **UV editor (F4)** wait for the v2 file (P2-13e), because both store their state in it; Q17 can move F2's gate earlier (F4 also needs P2-7).

If the owner wants F2, F3 (T7) and F6 (T8) earlier than the UV fix, the feature-gate block (rows 12–15) can merge before row 11 (P2-7), keeping the memory fix first. This moves those gates from about day 35 to about day 31 and delays the UV fix from day 23 to about day 35 (Q17). F4 gains nothing from the swap, because it needs P2-7 as well.

---

## 2. Current state

### 2.1 How a Phase-2 fix is wired after Phase 1

- **Switches.** `Strategies` (deep-frozen) holds every enumerated legacy behaviour. Each key is read at exactly one site (ARCHITECTURE §8.1, "Read by"):
  - an enumerated key is read with `switch`, and any non-legacy value throws `unsupportedStrategy(key, value)`;
  - numeric keys are used as values;
  - the `mesh.*` keys reach `WallMeshBuilder`, `ObjExporter` and `GltfExporter` through an injected `profile` (`this.profile.winding`, `profile.attributes`, …).
- **Tags.** Every other preserved defect is a `// LEGACY(B-xx): …` comment at the site listed in §8.3. It is mirrored by a `LEGACY_SITES` entry `{id, site, behaviour, fix}`.
- **Static gates.** `tests/static/check.mjs` keeps the two in sync:
  - rule 6: per file, the tag ids must equal the §8.3 rows for that file;
  - rule 8: every `Strategies` leaf must be referenced (rewritten in P2-13g, §4.1).
- **Verbatim rules.** R1 (verbatim), R8 (byte-identical markup) and R13 (no new `try/catch`) bind Phase 1 only. Each Phase-2 commit that departs from them lists the departure in §5.5.

### 2.2 Deduplicated defect register (57 ids → 21 root causes)

`docs/DEFECTS.md` already merges literal duplicates across the six per-subsystem reviews. Many ids are still one defect seen from several sides: the same line, the same function, or a latent consequence of another id. Each row below is one fix. The authoritative document for each id is in §5.6.

| RC | Root cause | Ids (merged) | Why they merge | Legacy lines (cd3fd3f) | Single site after Phase 1 (ARCHITECTURE §8) | Batch |
|---|---|---|---|---|---|---|
| RC-01 | Strip triangles are wound clockwise from +Z while the stored normals point +Z. Exports copy the winding and write constant or missing normals. Vertex normals are not averaged. | B-H1, B-H2, B-L3 (also the NORMAL half of B-M7) | One index function (`quadIndices`) and one normal function (`sectionGrid`) produce all 8 legacy index sites and every normal. | 1638, 1749, 4599-4600, 4648-4649, 4705-4706, 4844, 4863, 4887, 4589, 4635, 4819, 1607-1625 | `Strategies.mesh.{viewport,obj,gltf}.winding`, `.normals`, `mesh.obj.stripNormals`, `mesh.gltf.attributes`; tags `WallMeshBuilder.js#quadIndices` (B-H1, B-H2), `#sectionGrid` (B-L3), `LEDMaterialFactory.js#side` (B-H1), `ObjExporter.js#write` / `GltfExporter.js#addMesh` (B-H2) | P2-2 |
| RC-02 | Export encoders, index widths and canvas sizes are unguarded. | B-H3, B-L4, B-L5 | All three kill or corrupt an export (or a viewport texture) once the wall gets large, and none reports anything. | 4902, 4529, 4538, 4931, 4788, 4810; viewport canvases 1687, 2056 and the per-panel canvas 2003 | `Strategies.gltfBase64`, `mesh.gltf.indexType`; tags `LegacyCompat.js#legacySpreadBase64`, `ProjectIO.js#exportZIP` (B-H3, B-L4), `#exportPanelIds` (B-L4), `GltfExporter.js#write` (B-H3), `#addMesh` (B-L5); the viewport half of B-L4 and the viewport index width have no tag (§8.2 rows only) | P2-1 |
| RC-03 | Untrusted text goes into `innerHTML`, and imports are not validated. | B-M4, B-L8, B-L16, B-L21 | B-L8 is the source and B-M4 the sink. B-L16 patches the same title via an `innerHTML` regex. B-L21 is the import path forgetting logos. | 3923-3976, 4017, 2202, 4975-4992, 4064, 4976 | `legacyHtml`; `Strategies.importValidation`; the B-L8 tags in `WallSection#constructor`, `Wall#appendLikeLast/#replaceAll`, `LogoLibrary#get`, `WallMeshBuilder#sectionGrid`, `ObjExporter#write`, `GltfExporter#write`, `LEDWallView#rebuild`, `SectionLogosPanel#render`; `SectionListPanel#render/#patchCard`; `WallController#applyImport`, `SectionLogosPanel#constructor` (B-L21) | P2-3 |
| RC-04 | The order of the preview-off lifecycle is wrong. | B-H4, B-M8 | The same handler (4230-4249) leaves the pilot state and the safe-distance group behind. | 4232-4243, 3478-3483, 2536-2548, 2761 | `PilotController.js#toggle`, `CameraController.js#setPreviewEnabled` (B-H4, B-M8) | P2-4 |
| RC-05 | The safe-distance floor is broken. | B-M1, B-L29, B-M15 | B-L29 (downward faces) is latent until B-M1 makes the file reachable. B-M15 is the same builder. | 2826, 2703, 2668-2683 | `legacyMissingDownloadBlob`; `Strategies.safeDistanceBand`; `WallLayout.js#flatEdges`, `SafeDistanceView.js#create` | P2-5 |
| RC-06 | Duplicated serializer and naming code has drifted. | B-M3, B-M2, B-L14, B-L7 | The ZIP builds its own JSON (B-M3). Texture names are derived in three places (B-M2, B-L14). The MTL references files it does not ship (B-L7, the same line 4612 as B-M2). | 4499-4519 vs 4943-4963, 4612, 4540, 4092, 4915-4916 | `Strategies.zipJsonIncludesAngleOffset`, `mtlTextureNaming`, `zipTextureNaming`, `mtlDownloadDelayMs`; `PanelNaming.js#mtlTextureFile/#zipTextureFileName`, `ProjectIO.js#exportOBJ/#exportZIP` | P2-6 |
| RC-07 | UVs and texture atlas disagree across consumers. | B-M5, B-M6, B-M7 (UV half), B-L6, B-L18 | They share one atlas (`TextureAtlas`) and one combined material (line 1672 holds both B-M5 and B-L18). The combined export colour (B-L6) must follow per-section materials once UVs are an atlas. | 1627, 1672, 4584, 4819, 4564, 4850 | `Strategies.mesh.{viewport,obj}.combinedUV`, `mesh.gltf.attributes`, `exportCombinedColor`, `combinedLedSimColor`; `WallMeshBuilder.js#combinedGrid`, `LEDMaterialFactory.js#combined`, `LEDPixelTextureFactory.js#tile` | P2-7 |
| RC-08 | Panel mode draws one texture per panel. | B-M16, B-L19 | Both are in `createPanelIdTexture` (2001-2046): an unbudgeted canvas size, and a separate drawer that ignores logos and the label size. | 2001-2046, 2003 | `TextureAtlas.js#panelPxPerLed`, `PanelIdRenderer.js#panelCanvas` | P2-12d: the viewport panel-ID path and the panel-canvas budget (B-M16 retired). 04 UV-9 owns the export half and the `uv.panel_uvs` option (§5.6) |
| RC-09 | Resource lifetimes are not managed. | B-H5, B-L12, B-L20, B-L30 | Disposal and over-allocation on every rebuild or pose change. | 1458-1466, 2999, 1854, 2462 | `Strategies.dispose.*`; `LEDPixelTextureFactory.js#tile` (B-L20); `CameraController.js#CameraHub.refresh` (B-L30) | Phase 1C, else P2-12a (owner-visible block); P2-12b/c |
| RC-10 | Several sites assume a flat wall along +X. | B-L2, B-M10, B-L33 (+ the Z half of B-L10) | One `flatBounds()` feeds the orbit target, reset, coverage and safe-distance D. The frustum depth ignores the wall in the same way. The camera Z minimum is the same flat-wall assumption. | 3763, 2559, 2598-2612, 2471-2534, 2374, 3340 | `Strategies.framingBounds`, `frustumDepthM`; `Wall.js#flatBounds`, `WallLayout.js#framingBounds`, `CineCamera.js#coverage`, `#translateBy`, `OrbitController.js#updateTargetPosition`, `CameraRigView.js#rebuildFrustum` | P2-11 |
| RC-11 | The preview window renders wrongly. | B-M9, B-M11, B-L32, B-L34 | One class, `PreviewWindow`, is involved: its size, its content, its resize handle and its labels. | 3637, 3744, 3677, 3732 | `Strategies.previewRendererSize`, `previewRendersHelpers`; `PreviewWindow.js#init/#render/#setupResize/#updateCamera`, `SceneManager.js#addHelper`, `CineCamera.js#presetShortName` | P2-10 |
| RC-12 | Gizmo rotation and handle maths are wrong. | B-M12, B-L28, B-L22, B-L23 | All of them are in `TransformGizmo` drag handling and the `Selectable` writes. | 3368-3396, 3376, 3389, 2466 | `Strategies.gizmoRotateSign`; `CineCamera.js#rotateBy`, `Prop.js#translateBy/#rotateBy`, `TransformGizmo.js#rebuild/#updatePosition/#onMouseMove` | P2-9 |
| RC-13 | Movement and pilot-mode state are wrong. | B-M13, B-L27, B-L25, B-L26 | All are in the per-frame movement and pilot toggling. | 3572, 3884, 3865, 3483 | `Strategies.pilotForwardYSign`; `PilotController.js#tickKeyboard/#toggle`, `OrbitController.js#tickKeyboard/#setView`, `TransformGizmo.js#rebuild` (B-L26) | P2-9 |
| RC-14 | Pointer and keyboard routing are wrong. | B-M14, B-L11 | Both are in `ViewportInput` routing. | 3472, 4439-4448, 4411 | `SelectionManager.js#pickAt`, `ViewportInput.js#attachPointer/#attachShortcuts`, `InputState.js#isShortcutIgnoredTarget` | P2-9 |
| RC-15 | Numeric coercion rules are wrong. | B-L9, B-L10, B-L15 | All are in the rule tables (`orDefault`, `FIELD_RULES`) and the setters that bypass them. | 4030-4036, 4290, 4296, 3340, 3583, 4029 | `LegacyCompat.js#orDefault`; `WallSection.js#FIELD_RULES`, `WallMeshBuilder.js#sectionGrid` (B-L15); `CineCamera.js#pilotFly` (B-L10; the `#translateBy` half goes with RC-10) | P2-8 (P2-8a lands before P2-3b) |
| RC-16 | The mesh-mode handler fires twice. | B-L13 | – | 4156 | `WallDisplayPanel.js#bind`, `WallController.js#setMeshMode` | P2-8 |
| RC-17 | There is no wall-level texture-size warning. | B-L17 | – | 3908 | `WallSection.js#exceeds4K` | P2-13b |
| RC-18 | Logo loading is fragile. | B-L35 | – | 2127, 2256-2278 | `SectionLogosPanel.js#onUpload`, `PanelIdRenderer.js#sectionCanvas` | P2-13a |
| RC-19 | Persistence is incomplete. | B-L31 | – | 4942 | `ProjectSerializer.js#write` | P2-13e |
| RC-20 | Accessibility and overlay layout. | B-L24, B-L36 | – | 691, 931 | `css/07-viewport.css`, `css/09-viewport-tools.css`, `index.html` (documentation entries) | B-L24: 01 T7 and 06 T4a (07 C52); B-L36: P2-13c |
| RC-21 | The curve convention applies the step before the first panel. | B-L1 | – | 1508 | `Strategies.curveBeforeFirstPanel` | P2-13f (decision only) |

Counts: 3 + 3 + 4 + 2 + 3 + 4 + 5 + 2 + 4 + 3 + 4 + 4 + 4 + 2 + 3 + 1 + 1 + 1 + 1 + 2 + 1 = **57**. (B-L10 is counted once, in RC-15; its Z half is fixed with RC-10.)

**Observations without a bug id** (ARCHITECTURE §8.4) are not part of Phase 2 unless noted. Each is handled here:
- **Font weight 700 not loaded, and canvas text drawn before `document.fonts.load`.** Feature 6 handles this (font loading belongs to branding). It re-baselines the PNGs.
- **Synchronous `revokeObjectURL`.** P2-1a replaces it in `Downloader.saveBlob` with a revoke deferred by `setTimeout(…, 0)`. No output changes.
- **Stale `cameraBodyMesh`.** P2-4a nulls it in `CameraRigView.remove()`. No output changes.
- **Frustum built twice on the first enable.** P2-12c, together with B-L30 (pose-only refresh).
- **Invalid `<meta author>`.** Feature 6 handles it.
- **Pilot horizontal FOV mismatch.** P2-10d (optional): set `camera.aspect` from the filmback while piloting. It changes the `keyboard/pilot_view` screenshot, so it is a separate commit.
- **New, added by P2-6c: the second download of Export OBJ may be blocked.** Chrome may prompt for or block the `.mtl`, which is a second download fired by `setTimeout` (the residual half of B-L7). P2-6c removes the broken `map_Kd` reference but keeps two downloads (Q7). The residual behaviour is accepted and recorded as an ARCHITECTURE §8.4 observation in P2-6c.
- **New, found in planning: Uint16 index 65,535 in the viewport.** r128 `setIndex` keeps Uint16 when the maximum index is exactly 65,535, which WebGL2 treats as the primitive-restart index. P2-1e fixes it with the B-L5 threshold (§6.2).

### 2.3 What the golden master sees today

| Bug(s) | Captured today by | Blind spot (closed by P2-0 scenarios) |
|---|---|---|
| B-H1 | nothing; unlit DoubleSide hides it | the fix must produce **no** screenshot change except the documented wireframe WARN (invariance check) |
| B-H2, B-M6, B-M7, B-L6 | the OBJ/glTF outputs of the 7 config scenarios in 3 modes, plus the ZIP entries | – |
| B-H3 | `large_wall/console.json` (RangeError at `panel__export-gltf`) | – |
| B-L4 | none | `p2_oversize_canvas` (exports and a viewport screenshot) |
| B-M4, B-L14 | none (no special characters or duplicate names in any config) | `p2_xss_names` |
| B-M2, B-L7 | section-mode MTL in the config scenarios (`map_Kd textures/Wall_<i>_PanelIDs.png`) | `p2_zip_section_mode` (a ZIP exported in section mode) |
| B-M3 | `box_corner/zipjson_roundtrip__export-json` (offsets 0, 0, 0, 0) | – |
| B-H4 | `preview_off_in_pilot` (Phase 0) | – |
| B-M1 | `camera/console.json` (ReferenceError) and an empty `camera/downloads.json` | – |
| B-M15 | none (`camera` uses the flat `flat3`) | `p2_curved_safe_distance` (concave, convex, box corner, 30° concave) |
| B-M5, B-L18 | `mixed/panel_ids_combined` (B-M5); LED-sim screenshots in `toggles` (B-L18) | `p2_mixed_content` |
| B-L9, B-L15 | none | `p2_zero_inputs` |
| B-L11, B-L25 | none | `p2_shortcut_filters` |
| B-L31, B-L36 (aria sync) | none | `p2_project_v2` |
| B-M13, B-L27 | none (frame-count dependent) | manual checklist (§8.6) |

### 2.4 Constraints discovered while planning

1. **glTF size threshold.** See §0: P2-1 must come before P2-2 and P2-7.
2. **Shared files.** Several batches touch the same files, so batches are **merged one at a time**. They may be *developed* in parallel on branches, then rebased.

   | File | Touched by |
   |---|---|
   | `LegacyCompat.js` | every batch |
   | `ProjectIO.js` | P2-1, P2-3, P2-5, P2-6, P2-7, P2-13e |
   | `ProjectSerializer.js` | P2-3, P2-6, P2-13e |
   | `GltfExporter.js` | P2-1, P2-2, P2-7 |
   | `ObjExporter.js` | P2-1, P2-2, P2-5, P2-6, P2-7 |
   | `WallMeshBuilder.js` | P2-1, P2-2, P2-7, P2-8 |
   | `CameraController.js` | P2-4, P2-11, P2-12c, P2-13e |
   | `WallController.js` | P2-3b, P2-3d, P2-8d, P2-13b, P2-13e |
   | `domain/rules.js`, `WallSection.js` | P2-8a, P2-3b, P2-8b, P2-8c, P2-13g |
   | `io/ProjectValidator.js`, `io/ProjectSchema.js`, `io/ProjectMigrations.js` | P2-3b, P2-13e (and later 07 D2/D3/D4) |
3. **The baseline is local and git-ignored** (`tests/regression/output/`). Phase 1 always captured it from `cd3fd3f`. In Phase 2 the baseline is **the harness output of the parent commit** (§8.1).
4. **Unit golden tests** (`io.test.mjs` reads `GOLDEN_DIR`) and **oracle tests** (`geometry.test.mjs`, `io.test.mjs` against `tests/unit/oracle/*`) assume legacy values. P2-0 adds `LegacyProfiles` so that the oracle tests stay meaningful after each flip (§4.2).
5. **The harness has no frozen clock.** Any time-dependent output would make every run differ. This matches 07 C10: v2 project files carry no timestamp at all, so P2-13e writes none.
6. **The harness records only exceptions, `console.error`/`console.assert` and failed network requests** (`tests/regression/lib/app.mjs`, `_wireEvents`). A `console.warn` is never recorded, and a successful request is invisible. Manifests therefore never expect a warning in `console.json`; warnings are checked by unit-test spies. P2-0 adds an opt-in full request log for the one scenario that must prove "no network request" (§8.2).
7. **Known nondeterminism.** The harness README documents a bistable 1-level jitter of 1–8 pixels on DOM text drawn over a WebGL canvas (help badge, pilot banner, preview header and footer) in many scenarios, and ZIP container bytes. P2-0 turns that documentation into a standing allowlist that every gate run includes (§8.1, §8.2).

---

## 3. UX design

Phase 2 adds **no new features and no new keyboard shortcuts**. It changes behaviour where the current behaviour is the bug, and it adds error feedback where failures are silent today.

### 3.1 Principles
- **Feedback channel.** Use the existing native `alert` via the injected `dialogs` (`createDialogs(win)`), the same channel import errors use today. 07 tasks E1/E2 later reroute the same message ids to non-blocking toasts with the same texts (Q9).
- **Report, then continue.** A problem the app can repair, such as an out-of-range import value, is corrected and reported. Only problems it cannot repair abort, such as a file with no sections or an image larger than the browser can create.
- **The app never writes a file it would refuse or alter on import.** Every import limit is also a UI limit, and every value the UI can produce passes the validator unchanged (§4.3, criterion 16). This includes logos, whose size cap is measured on the stored bytes after conversion (§6.16), and the order of commits: a UI rule always lands before or with the validator rule that mirrors it (P2-8a before P2-3b).
- **No silent downloads of broken files.** No 0-byte PNG, and no MTL that references files not shipped.
- **Every message names the export, the reason and the remedy.**

### 3.2 Behaviour changes users will notice

| Batch | Where | Before | After |
|---|---|---|---|
| P2-1 | Export glTF / Export All (ZIP) on large walls | Nothing happens; the console shows a RangeError | The file downloads |
| P2-1 | Export Panel IDs with an image wider than the browser limit | Uncaught TypeError, no file | An alert explains the size and the remedy; no file |
| P2-1 | Export All (ZIP) with an oversize section texture or atlas | A 0-byte PNG inside the ZIP; the MTL references it | The ZIP downloads without that texture, its MTL `map_Kd` and JSON reference are omitted, and an alert lists what was left out |
| P2-1 | Panel IDs on, with a section (or the combined atlas, or in panel mode a single panel) larger than the browser's canvas limit | Blank texture in the viewport | The section colour is shown; a console warning; P2-13b adds a sidebar line |
| P2-2 | Exported OBJ/glTF in any DCC tool or engine | Faces point away from the stage; constant or no normals | Faces and normals point at the stage; curved walls shade smoothly |
| P2-3 | Importing a file with bad values | Values accepted raw; possible broken geometry, hangs or injected HTML | Values corrected; one alert lists the corrections (§3.3) |
| P2-3 | Importing a file with no `sections` list | Silently ignored (V-6) | Alert: "Import failed: …" |
| P2-3 | Add Section with 200 sections (07 `MAX_SECTIONS`) | Adds a 201st section; that file could no longer be imported | Alert M-SEC-1; nothing is added (07 D1 later also disables the button) |
| P2-3 | Renamed section crossing the 4K canvas size | No ⚠ in the title | ⚠ shown, like default-named sections |
| P2-3 | Import while panel IDs are on | The logo list keeps the old sections' logos | Logos reset; the logo list re-renders |
| P2-4 | Preview off while piloting | Stuck in pilot mode, with an alert | Pilot exits; the orbit view is restored; no alert |
| P2-4 | Preview off with Safe Distance on | The floor stays in the scene | The floor is removed, and returns when the preview is turned back on |
| P2-5 | Export Safe Distance OBJ | Nothing happens | `safe-distance-floor.obj` downloads |
| P2-5 | Safe-distance floor on curved and cornered walls | Per-column quads overlap (concave) or leave gaps (convex) | A mitred band; on concave curves and corners it narrows so it never crosses itself. Where it is narrower than D, its outer edge is drawn amber instead of red, and the exported OBJ header states how many offset vertices were clamped (§6.9) |
| P2-6 | Standalone Export OBJ, section mode | MTL references `textures/Wall_<i>_PanelIDs.png`, which are never delivered | MTL has no `map_Kd`. Textured OBJ is available through Export All (ZIP) |
| P2-7 | Combined mode, sections of different pixel heights | Panel IDs or LEDs squashed and stretched on short sections | Pixel-accurate, identical to `panel-ids.png` |
| P2-7 | Combined LED-sim colour | White LEDs regardless of section colour | LEDs take the section colour, as in section and panel modes |
| P2-8 | Typing `0` in Camera Y | Snaps to 1.5 | Stays 0 |
| P2-8 | Typing `2.5` in Columns | Garbage geometry | Rounds to 3; the integer fields get `step="1"` |
| P2-8 | Pilot mode flying down to the floor | Stops at 0.1 m | Stops at 0 m (the same floor as the input and the gizmo) |
| P2-9 | Click-dragging to orbit while a gizmo mode is on | Deselects the object | Selection kept. Selection happens on a click that travels less than 4 px |
| P2-9 | G/R/L/P with a select box focused, with Ctrl/Cmd, or while held | Fires the shortcut, toggling repeatedly | Ignored |
| P2-9 | Rotate gizmo | Rotates opposite to the drag | Follows the drag |
| P2-9 | Person and car gizmo | Shows inert handles (Y arrow, X/Z rings) | Shows only working handles (X/Z arrows, Y ring) |
| P2-9 | Pilot mode: W while looking up | Moves down | Moves up |
| P2-9 | View-preset buttons in pilot mode | Break the pilot view | Exit pilot mode first, then apply the preset (the 07 §3.7 behaviour) |
| P2-10 | Preview window | Image stretched about 18%, clipped by 4 px; shows the grid, gizmo and an orange tint; extreme custom filmbacks blow the window up to 12,000 px | Image letterboxed to the exact filmback aspect (black bars); window clamped per axis to 200–800 × 120–600 px; shows only the scene the film camera would see |
| P2-10 | Preview header and footer | "ARRI" for both ARRI presets; a made-up "1920×1080" | "ARRI LF", "ARRI Alexa", …; the real drawn size, e.g. "264×176 px" |
| P2-11 | Frame status | Ignores pan, tilt and roll and the real wall shape | Raycasts the real wall; new status "Not aimed at wall" |
| P2-11 | Camera Z input and Reset on non-flat walls | "Z Distance from Wall (m)", minimum 0.1; Reset puts the camera at z = 5 facing −Z whatever the wall shape | "Z Position (m)", no minimum (Q13); Reset faces the wall's chord (§6.10) |
| P2-13a | Uploading a logo | Corrupt images fail silently; SVGs without a size are invisible; any size accepted | Corrupt images alert M-LOGO-1; SVGs render; files over 2 MB are refused (M-LOGO-2); a GIF, BMP or AVIF whose PNG conversion exceeds 2 MB is downscaled until it fits; a 65th distinct logo image in one project is refused (M-LOGO-3) |
| P2-13e | Export JSON / Import JSON | Only sections and mesh mode are saved | Camera, props, display toggles, panel-ID style and logos are saved and restored (07 §4.2 format) |
| P2-13b | Wall wider than 4K, or wider than the browser's canvas limit | No wall-level warning | A warning under the mesh-mode cards (§3.4) |
| P2-13c | Toggle switches | Mouse only | Tab-focusable; Space/Enter toggle; `role="switch"` with `aria-checked` kept in sync |

### 3.3 Messages (exact strings)

| Id | Trigger | Text |
|---|---|---|
| M-EXP-1 | Any export function throws (`ProjectIO.#runExport`) | `` `${label} failed: ${err.message}. No file was downloaded.` `` with `label` ∈ `Export JSON`, `Export OBJ`, `Export glTF`, `Export Panel IDs`, `Export All (ZIP)`, `Export Safe Distance OBJ` |
| M-EXP-2 | Panel-ID atlas larger than `CANVAS_HARD_LIMITS` | `` `The Panel ID image would be ${w}×${h} px, larger than this browser can create (${maxSide} px per side, ${maxMP} MP). Reduce Pixels X/Y or the number of columns, or use Export All (ZIP), which writes one image per section.` `` |
| M-EXP-3 | `toBlob` returned `null` (a device limit below the hard limit) | `` `This browser could not create the ${w}×${h} px Panel ID image. Reduce Pixels X/Y or the number of columns.` `` |
| M-EXP-4 | ZIP finished with skipped textures | `` `The ZIP was created, but ${n} texture(s) were too large for this browser and were left out: ${names.join(', ')}.` `` Names are the ZIP entry names, including `textures/panel-ids.png` for the atlas (P2-7f) |

**Import messages.** Every import failure is an issue of severity `error` in the 07 §4.7 shape; the alert shows the `message` of the first error issue. Every correction is an issue of severity `warning`; M-IMP-5 lists their messages. The issue codes are 07 §4.7's; §4.3 here lists them.

| Id | 07 issue code (severity) | Trigger (07 §4.6 detection order) | Text (`issue.message`) |
|---|---|---|---|
| M-IMP-6 | `too-large` (error) | `file.size > MAX_IMPORT_BYTES` (§4.3), checked before reading | `` `Import failed: the file is larger than ${Math.round(MAX_IMPORT_BYTES / 1048576)} MB, the maximum for a project file.` `` (179 MB; amendment A1) |
| M-IMP-7 | – (no issue; the file was never read) | `reader.onerror` (B-L8: legacy has no handler, so a read failure was silent) | `` `Import failed: the file could not be read (${reader.error?.name ?? 'unknown error'}).` `` |
| (kept) | `parse-error` (error) | `JSON.parse` throws | `Error parsing JSON file: ${err.message}` (the legacy text, V-5) |
| M-IMP-4a | `unsupported-format` (error) | `data` is not a plain object (for example `null` or an array), or `data.format` is present and is not `"morph-led-project"` | `Import failed: this is not an LED wall project file.` |
| M-IMP-4b | `newer-version` (error) | `data.version` matches `/^(\d+)\.(\d+)$/` with major > 2; **before P2-13e**, any major ≥ 2 (the reader knows only v1 until then) | `` `Import failed: this project was saved by a newer version of the app (version ${data.version}).` `` |
| M-IMP-1 | `no-sections` (error) | no v2 version and `data.sections` is not an array | `Import failed: the file does not contain a "sections" list.` |
| M-IMP-2 | `no-sections` (error) | the sections array is empty | `Import failed: the file contains no wall sections.` |
| M-IMP-3 | `limit-exceeded` (error) | more than `MAX_SECTIONS` (200) sections | `` `Import failed: ${n} sections is more than the maximum of 200.` `` |
| M-IMP-5 | any `warning` | the import was applied with corrections | `` `Imported with ${n} correction(s):\n` `` followed by up to 10 lines `` `• ${issue.message}` ``, then `` `• …and ${n-10} more` `` if more. `info` issues (`migrated`, `wrapped`, `dropped-unknown`) are not listed |
| (warning) | `newer-revision` (warning) | `data.version` is `"2.<m>"` with `m` > `KNOWN_REVISION` (from P2-13e) | `Some settings were saved by a newer version and were ignored.` (07 §4.4 rule 4), listed in M-IMP-5 |

**Correction messages** (`issue.message` of warnings; plain text in a native alert, so no escaping is needed):
- Section-level: `` `Section ${i+1} "${name}": ${label} ${from} → ${to}` ``, for example `Section 2 "Strings": Columns "10" → 10`.
- File-level: `` `${label}: ${from} → ${to}` ``, for example `Mesh mode: "weird" → "combined"` or `Logo "logo.svg": dropped (not a PNG, JPEG, WebP or SVG data URL)`.
- `name` is the corrected name. `from` and `to`: strings are written with `JSON.stringify`, numbers as they are, anything else as `(invalid)`; each is truncated to 40 characters.
- `label` uses the UI labels: `Columns`, `Rows`, `Width (mm)`, `Height (mm)`, `Pixels X`, `Pixels Y`, `Angle Between Panels (°)`, `Section Offset (°)`, `Panel Color`, `Section Name`, `id`; file-level labels are `Mesh mode`, `Logo "<asset name>"` and, for the v2 blocks (P2-13e), the UI label of the field (`Camera Y Height (m)`, `Person Scale`, …).

| Id | Trigger | Text |
|---|---|---|
| M-SEC-1 | Add Section with `MAX_SECTIONS` (200) sections (P2-3b) | `A wall can have at most 200 sections.` |
| M-LOGO-1 | `reader.onerror`, `img.onerror`, a failed decode or an unparseable SVG (P2-13a) | `` `Could not load the logo image "${file.name}". Use a PNG, JPEG, WebP or SVG file.` `` |
| M-LOGO-2 | The file, or an SVG after sanitising, is larger than `MAX_LOGO_BYTES` (2 MiB), or a converted raster still exceeds it after three downscales (P2-13a, §6.16) | `` `The logo "${file.name}" is larger than 2 MB. Use a smaller PNG, JPEG, WebP or SVG file.` `` |
| M-LOGO-3 | The upload would make the project use more than `MAX_LOGO_ASSETS` (64) distinct logo images (P2-13a) | `This project already uses 64 different logo images, the maximum. Reuse one of them or remove a logo first.` |
| M-COV-1 | Coverage status `offWall` (P2-11) | Status text `Not aimed at wall`, colour `theme.ui.status.exceeds` |

### 3.4 Wireframes

**P2-13b / B-L17: wall-level texture warning.** It appears in the "Mesh Options" global section, under the mesh-mode cards. Its markup reuses the existing `.section-warning` look. The **downscale line** appears only in combined mode, when the combined texture exceeds 4K (the viewport texture of that mode). The **export line** appears in **every mode**, because Export Panel IDs exists in every mode. The **display line** appears when panel IDs are on and a viewport canvas does not fit (P2-1d).

```
┌ Mesh Options ─────────────────────────────┐
│ ( ) Combined  ( ) Per Section  ( ) Panels │
│ ┌───────────────────────────────────────┐ │
│ │ ⚠ Combined texture is 6400×192 px     │ │  <- #wall-texture-warning (role="status"),
│ │   (over 4K). Panel IDs and LED pixels │ │     hidden (display:none) when no line applies
│ │   may be downscaled. Per Section mode │ │     line 1: combined mode, over 4K
│ │   keeps one texture per section.      │ │
│ │ ⚠ Panel ID export (panel-ids.png) is  │ │     line 2: any mode, atlas exceeds
│ │   unavailable at this size.           │ │             CANVAS_HARD_LIMITS
│ │ ⚠ Panel IDs cannot be displayed for:  │ │     line 3: panel IDs on, a viewport canvas
│ │   Stage Left, Stage Right.            │ │             does not fit (P2-1d fallback)
│ └───────────────────────────────────────┘ │
│ Wireframe                         [  o]   │
└───────────────────────────────────────────┘
```

The status comes from `WallController` in the `WALL_REBUILT` payload (§5.2, §5.4), so `WallDisplayPanel` never imports `geometry/` (ARCHITECTURE §1.3).

**P2-10 / B-M9, B-L32: preview window.** The window keeps its legacy size and aspect-locked drag; each axis is then clamped on its own. The image inside is letterboxed to the filmback aspect, so it is never stretched (07 §3.6 semantics, §6.14).

```
         outer W ∈ [200, 800] CSS px (border-box, 2 px border)
┌──────────────────────────────────────┐   inner box  = outer − 4 px on each axis
│↖ 📷 Camera View   35mm • Full Frame  │   renderer.setSize(inner)        (no 4 px clipping)
│ ▓▓▓┌────────────────────────────┐▓▓▓ │   image rect = letterbox(inner, filmback aspect)
│ ▓▓▓│ scene only: no grid, axes, │▓▓▓ │   black bars: scissor clear outside the image rect
│ ▓▓▓│ gizmo, rig, safe-distance  │▓▓▓ │   outer H ∈ [120, 600] CSS px
│ ▓▓▓└────────────────────────────┘▓▓▓ │
│ H: 54.4° V: 37.8°         264×176 px │   footer: drawn image size × devicePixelRatio
└──────────────────────────────────────┘
```

### 3.5 Keyboard and pointer

- **Existing shortcuts are unchanged:**
  - G (translate gizmo), R (rotate gizmo), L (world/local), P (pilot), Escape (exit pilot, or deselect and clear the gizmo mode);
  - WASD/arrows/QE (orbit offset, or pilot fly);
  - mouse drag (orbit or pilot look), wheel (zoom or pilot speed).
- **P2-9 / B-L11 filters.** Shortcuts are ignored when any of the following holds:
  - `e.target` is `INPUT`, `TEXTAREA`, `SELECT` or `isContentEditable`;
  - `e.ctrlKey || e.metaKey || e.altKey`;
  - `e.repeat`.

  Shift is allowed (Shift+G still means G). The orbit/pilot movement state (`KeyboardState`) is unchanged: it already ignores `INPUT`, `SELECT` and `TEXTAREA`.
- **P2-9 / B-M14 select on click.**
  - `mousedown` on the canvas starts an orbit. It still lets the gizmo claim a handle hit first, but it no longer picks.
  - `mouseup` picks only if all of these hold: left button, travel under 4 CSS px, no gizmo drag in progress, and a gizmo mode is active (the legacy gating).
  - Right and middle clicks never pick or deselect.
- **P2-9i / B-L25 view presets in pilot mode.** A click on Front, Side, Top or Reset while piloting first exits pilot mode (`pilot.toggle()`, the clean exit of P2-4) and then applies the preset. This is the 07 §3.7 behaviour, adopted here so the two specs agree (§5.6). No message is shown in Phase 2; 07's toast comes with 07 E1.
- **P2-13c / B-L36 toggles.** Each `div.toggle` gets `tabindex="0"`, `role="switch"`, `aria-checked` and `aria-label` (the text of its `.toggle-label`). `keydown` Space/Enter calls `preventDefault()` and then `el.click()`. Every write of a toggle's state goes through one helper, `setToggle(el, on)`, which sets the `active` class and `aria-checked` together (§6.18). The existing ARCHITECTURE helper `flipToggle(el)`, which every panel's click handler calls, is re-implemented on top of it, so no click path can set the class without `aria-checked`.
  - **Conflict check:** Space and Enter are not used by `KeyboardState` (it maps WASD, arrows, Q and E) or by the shortcut router.
  - Arrow keys pressed while a toggle is focused still orbit, as they do with the body focused today.
- **No other new key bindings.** The Feature 1 normals view and the Feature 4 UV editor define their own; see their specs.

### 3.6 Empty and error states
- **Empty wall.** After P2-3 an empty wall is impossible: the validator requires at least one section, and `deleteSection` already refuses the last one. **Full wall:** `addSection` refuses a 201st section (M-SEC-1).
- **Export Safe Distance OBJ with no floor.** The existing alert stays: `Enable Safe Distance 3D visualization first`.
- **Pilot entry with the preview off.** The existing alert stays: `Enable Camera Frustum Preview first to use Pilot Mode`. Only *exiting* is unguarded.
- **Coverage (P2-11).** When the frame does not touch the wall, the status shows `Not aimed at wall`. When no wall plane lies in front of the camera at all (`D0 === null`, §6.10), `#frustum-width` and `#frustum-height` also show `—`. `#safe-distance` always keeps its value (it does not depend on the pose).
- **Logos that fail validation on import (P2-13e).** The logo is dropped, the section keeps no logo, and M-IMP-5 lists it.
- **A camera pose saved with the preview off (P2-13e).** It is restored into the model and kept when the user next turns the preview on (the one-shot exception to "enabling the preview resets the pose", §6.17, Q19).

---

## 4. Data model

### 4.1 `Strategies`: Phase-1 values → end of Phase 2

"Retire" means three things happen in the same commit:
- the key and its `switch` are deleted;
- the fixed behaviour becomes the only code path;
- the §8.1 row and the `LEGACY_SITES` entries are removed.

"Keep (legacy case retained)" applies only to `mesh.*` profile keys. Their legacy case stays reachable via `LegacyProfiles` (§4.2) so that the oracle tests keep testing it.

| Key | Phase 1 | After Phase 2 | Batch / commit | Disposition |
|---|---|---|---|---|
| `mesh.viewport.winding` | `'legacy-cw'` | `'ccw'` | P2-2a | keep; legacy case retained |
| `mesh.viewport.side` | `'double'` | `'double'` | – | keep. This is a design choice now, not a bug: the orbit can go behind the wall. `'front'` would be a Feature 1/5 option (Q3) |
| `mesh.viewport.normals` | `'right-panel'` | `'averaged'` | P2-2b | keep; legacy case retained |
| `mesh.viewport.combinedUV` | `'atlas-u-full-v'` | `'atlas-pixel-accurate'` | P2-7a | keep; legacy case retained. 04 UV-7 later adds the case `'plan'` and makes it the value; `'atlas-pixel-accurate'` stays a supported case (04 §5.5) |
| `mesh.obj.winding` | `'legacy-cw'` | `'ccw'` | P2-2c | keep |
| `mesh.obj.normals` | `'none'` | `'averaged'` | P2-2c | keep |
| `mesh.obj.stripNormals` | `'constant-z'` | `'per-vertex'` | P2-2c | keep |
| `mesh.obj.panelNormal` | `'facing'` | `'facing'` | – | unchanged; it is consistent once the winding flips (§6.4) |
| `mesh.obj.combinedUV` | `'per-section-overlap'` | `'atlas-pixel-accurate'` | P2-7b | keep; legacy case retained. 04 UV-8a later adds `'plan'` and makes it the value |
| `mesh.gltf.winding` | `'legacy-cw'` | `'ccw'` | P2-2d | keep |
| `mesh.gltf.normals` | `'none'` | `'averaged'` | P2-2d | keep |
| `mesh.gltf.panelNormal` | – (absent) | `'facing'` | P2-2d | **new leaf**, so the glTF builder can emit panel normals |
| `mesh.gltf.attributes` | `['POSITION']` | `['POSITION','NORMAL']` (P2-2d), then `['POSITION','NORMAL','TEXCOORD_0']` (P2-7c) | P2-2d, P2-7c | keep. Read rule (04 §5.5): iterate, `switch` each element over `'POSITION' \| 'NORMAL' \| 'TEXCOORD_0'`, throw `unsupportedStrategy` in `default` |
| `mesh.gltf.combinedUV` | – (absent: legacy glTF had no UVs) | `'atlas-pixel-accurate'` | P2-7c | **new leaf** (04 §2.3 row 08-3), read only inside the `TEXCOORD_0` case of the combined writer. 04 UV-8b later adds `'plan'` and makes it the value. `LegacyProfiles.mesh.gltf` has no such leaf, because its attribute list has no `TEXCOORD_0` and the leaf is never read |
| `mesh.gltf.indexType` | `'uint16'` | `'auto'` | P2-1b | keep |
| `mesh.gltf.doubleSided` | `'omit'` | `'omit'` | – | keep. P2-2d adds the `'true'` case (writes `doubleSided: true`) for a later export option (Q2) |
| `gltfBase64` | `'spread'` | – | P2-1a | **retire** (chunked encoder only) |
| `exportCombinedColor` | `'first-section'` | – | P2-7d | **retire** (per-section materials) |
| `mtlTextureNaming` | `'index'` | – | P2-6d | **retire** (`textureFileNames`) |
| `zipTextureNaming` | `'sanitized-name'` | – | P2-6b | **retire** (unique names) |
| `mtlDownloadDelayMs` | `100` | – | P2-6c | **retire**; becomes `ProjectIO.MTL_DOWNLOAD_DELAY_MS = 100` (no longer a defect) |
| `zipJsonIncludesAngleOffset` | `false` | – | P2-6a | **retire** |
| `importValidation` | `'none'` | – | P2-3b | **retire** (always validate) |
| `framingBounds` | `'flat'` | `'layout'` | P2-11c | keep (a real configuration point). P2-11c implements `'layout'` with `FramingPolicy`'s three named boxes (§6.10, 07 C34). At P2-13g it moves to `js/geometry/FramingPolicy.js` (below). If Feature 3 step A lands first it adds `'flat-pivot'`, which P2-11c then replaces; once P2-11c has landed, 03 step F is empty (03 §5.7) |
| `curveBeforeFirstPanel` | `true` | – | P2-13f | **retire** if the owner keeps the convention (recommended, Q10): it becomes the only code path and ARCHITECTURE §1.4 documents it. v2.0 files carry no convention key (07 C6: absent means the legacy convention); if the owner ever changes the convention, 07 C6's additive `curvature_convention` key and `layoutOptions.curveConvention` read are added then (amendment A6, §5.6.1) |
| `safeDistanceBand` | `'per-column-own-normal'` | – | P2-5b | **retire** (mitred, clamped band). 01's intermediate value `'per-column-own-normal-up'` is never added (§5.6) |
| `frustumDepthM` | `15` | – | P2-11b | **retire**; becomes `CameraRigView.MAX_FRUSTUM_DEPTH_M = 15` as a fallback only |
| `previewRendererSize` | `[320, 180]` | – | P2-10b | **retire**; the renderer is sized from the window's inner box (§6.14) |
| `previewRendersHelpers` | `true` | – | P2-10a | **retire** |
| `gizmoRotateSign` | `-1` | – | P2-9c | **retire** |
| `pilotForwardYSign` | `-1` | – | P2-9g | **retire** |
| `combinedLedSimColor` | `'white'` | – | P2-7e | **retire** |
| `dispose.wallTextures` | `false` | – | Phase 1C H1, else P2-12a | **retire** (always dispose maps) |
| `dispose.gizmo` | `false` | – | Phase 1C H2, else P2-12a | **retire** |

**P2-13g: where the surviving keys go.** `Strategies` is deleted. Its two surviving parts move out of `legacy/`:
- `js/geometry/MeshProfiles.js`: `export const MeshProfiles = deepFreeze({ viewport, obj, gltf })`, the `Strategies.mesh` values. `App.js` injects `MeshProfiles.*` as the builder and exporter profiles.
- `js/geometry/FramingPolicy.js`: `export const FramingPolicy = deepFreeze({ bounds: 'layout' })`, plus the three named boxes every consumer names (07 C34, §6.10): `generativeBox`, `wallBox` and `stageExtent`. `WallLayout.framingBounds` reads `FramingPolicy.bounds` with the same switch-and-throw.
- **Timing.** P2-13g lands after F1-5 and F3 step A have edited their `Strategies` keys; if it lands first, those features edit `MeshProfiles` and `FramingPolicy` instead.
- `deepFreeze` is exported from `js/domain/rules.js` (created in P2-8a), a verbatim copy of the module-private helper in `LegacyCompat.js`. Geometry may import `domain/`; `legacy/` may not import `domain/`, so `LegacyCompat.js` keeps its private copy for `LegacyProfiles`.
- `LegacyCompat.js` keeps only `LegacyProfiles`, `unsupportedStrategy` and the residual `LEGACY_SITES`.
- **`tests/static/check.mjs` rule 8** is rewritten in the same commit: "every leaf of `MeshProfiles` and `FramingPolicy` is referenced at its read site (§8.1 'Read by'), and `Strategies` no longer exists." Rule 6 is unchanged.

### 4.2 `LegacyProfiles` (new in P2-0, `js/legacy/LegacyCompat.js`)

```js
/** The exact Phase-1 mesh profiles. Production code never reads these; the oracle tests inject them
 *  into WallMeshBuilder / ObjExporter / GltfExporter so that the "builder == verbatim oracle" tests stay
 *  meaningful after each Phase-2 flip. Every value here must stay a supported case of the builder. */
export const LegacyProfiles = deepFreeze({
  mesh: {
    viewport: { winding: 'legacy-cw', normals: 'right-panel', combinedUV: 'atlas-u-full-v', side: 'double' },
    obj:      { winding: 'legacy-cw', normals: 'none', stripNormals: 'constant-z',
                combinedUV: 'per-section-overlap', panelNormal: 'facing' },
    gltf:     { winding: 'legacy-cw', normals: 'none', attributes: ['POSITION'], indexType: 'uint16',
                doubleSided: 'omit' },
  },
});
```

**This is the only legacy-profile fixture.** 01 §8.1 calls it `LEGACY_MESH_PROFILES`; that name is not created (§5.6).

**Rule.** Global keys such as `exportCombinedColor` or `gltfBase64` cannot be injected. When one is retired, the oracle cases that depend on it become explicit expected-value tests in the same commit.

### 4.3 Import validation (`js/io/ProjectValidator.js`, `js/io/ProjectMigrations.js`, `js/io/ProjectSchema.js`, P2-3b)

**Contract.** P2-3b implements the **wall subset of 07 tasks D2 (validator) and D3 (v1 migration)** with 07's contracts unchanged: the detection and migration of 07 §4.6 and §6.9, the validator signature, issue shape, codes and atomicity of 07 §4.7, the coercion rules of 07 §6.7 and the id reassignment of 07 §6.8. P2-13e adds the v2 path to the same three modules (§4.6). 07 D2/D3 later add the feature rows, the fuzz tests and the `budget` check to these modules; they never replace them (§5.6). Where this roadmap differs from 07 on purpose, §5.6.1 lists the amendment (A1–A6).

**Signatures (07 §4.7, §5.5.1).**

```ts
// io/ProjectValidator.js (pure)
validateProject(input: object, { limits, palette, knownRevision, exportLimits? })
  -> { ok: boolean, project: object | null, issues: Issue[] }          // ok === false  <=>  some issue has severity 'error'
type Issue = { path: string,                 // v2 path, e.g. 'sections[2].panel.columns' (identical to the v1 path: v2 is a superset)
               code: IssueCode, severity: 'info' | 'warning' | 'error',
               message: string,              // plain text, §3.3 (M-IMP-x for errors, the correction line for warnings)
               from?: unknown, to?: unknown };
type IssueCode = 'parse-error' | 'too-large' | 'unsupported-format' | 'newer-version' | 'no-sections' | 'limit-exceeded'
               | 'coerced' | 'clamped' | 'rounded' | 'wrapped' | 'defaulted' | 'truncated' | 'sanitized' | 'reassigned-id'
               | 'missing-asset' | 'invalid-reference' | 'dropped-unknown' | 'newer-revision' | 'migrated' | 'budget';

// io/ProjectMigrations.js (pure)
detectVersion(data) -> { kind: 'v1' } | { kind: 'v2', revision: number } | { error: Issue }       // 07 §4.6
migrateV1toV2(data, { palette }) -> { scope: 'wall', wall: { sections, mesh_mode }, issues: [migrated] }   // 07 §6.9

// io/ProjectSerializer.js
read(data, { exportLimits? } = {}) -> { ok, project, issues, sourceVersion: 1 | 2, scope: 'wall' | 'full' }   // 07 §5.5.1

// io/ProjectSchema.js (pure): the machine-readable rows the validator walks (07 §4.4 rule 3), plus
sectionsFromProject(project) -> WallSection[]          // io may import domain (ARCHITECTURE §1.3)
```

- `ok === false` exactly when an issue has severity `error`; then `project === null` and **no live state is touched** (atomic import, 07 §4.7).
- Phase 2 never passes `exportLimits`, so the `budget` warning is not raised (07 §4.7 allows this). The wall-level texture warning of P2-13b covers that information in the UI instead.
- Idempotence and fidelity are 07's (§4.7): `validateProject(validateProject(x).project)` raises no issue, and every file the app writes validates with zero issues and unchanged values. The rule tables below are the same ones the UI uses (§4.4), which is what makes fidelity hold.

**Pipeline (`ProjectIO.importFromInputEvent`).**

```
file = e.target.files[0]; if (!file) return; e.target.value = '' stays synchronous (V-7)
if (file.size > MAX_IMPORT_BYTES) -> alert M-IMP-6 (too-large); stop                      // before reading
reader.onerror -> alert M-IMP-7; stop                                                      // B-L8 sub-issue
data = JSON.parse(text)   catch -> alert "Error parsing JSON file: …" (legacy V-5 text); stop
r = serializer.read(data)
     detectVersion(data)                                  07 §4.6, in this order:
        not a plain object                       -> unsupported-format (M-IMP-4a)
        format present and !== 'morph-led-project' -> unsupported-format (M-IMP-4a)
        version matches /^(\d+)\.(\d+)$/, major >= 2:
            before P2-13e: newer-version (M-IMP-4b)
            from P2-13e:   major > 2 -> newer-version (M-IMP-4b); major 2 -> v2 path, revision = minor
        Array.isArray(data.sections)             -> v1 path ('version' "1.0", absent or anything else: legacy ignored it)
        otherwise                                -> no-sections (M-IMP-1)
     v1: m = migrateV1toV2(data, {palette}); validateProject({ sections: m.wall.sections, mesh_mode: m.wall.mesh_mode }, …)
         scope 'wall'; the result's other keys are defaults and are not applied
     v2 (P2-13e): validateProject(data, …); scope 'full'
if (!r.ok) -> alert(first error issue's message); stop                                      // nothing changed
scope 'wall': wallController.applyImport({ sections: sectionsFromProject(r.project),
                                           meshMode: r.project.mesh_mode ?? project.meshMode, logos: null })
scope 'full': ProjectIO.#applyV2(r)   (§6.17)
if (r.issues has severity 'warning') -> alert M-IMP-5
```

**Limits (one source; §4.4).**

| Constant | Value | Enforced by |
|---|---|---|
| `Wall.MAX_SECTIONS` | 200 (07 §4.1, §4.3) | `WallController.addSection` (M-SEC-1) **and** the validator (`limit-exceeded`, M-IMP-3), in the same commit (P2-3b) |
| `WallSection.LIMITS` | the 07 §4.3 ranges (table below; added to the UI rules by P2-8a, **before** P2-3b) | `FIELD_RULES` **and** the validator |
| `MAX_LOGO_BYTES` | 2,097,152 (2 MiB, decoded; 07 §4.5), measured on the **stored** bytes after conversion and sanitising (§6.16) | logo upload (M-LOGO-2, P2-13a) **and** the v2 validator (a larger logo is dropped with a correction, P2-13e) |
| `MAX_LOGO_ASSETS` | 64 distinct logo images (07 §4.3 `assets[] ≤ 64`) | logo upload (M-LOGO-3, P2-13a) **and** the v2 validator |
| `MAX_LOGO_DATAURI_CHARS` | `32 + 4 · ceil(MAX_LOGO_BYTES / 3)` = 2,796,236 | v2 validator |
| `MAX_IMPORT_BYTES` | `MAX_STRUCTURE_BYTES + MAX_LOGO_ASSETS · MAX_LOGO_DATAURI_CHARS` = 8,388,608 + 178,959,104 = **187,347,712** (≈ 179 MB) | `ProjectIO.importFromInputEvent` before reading (M-IMP-6). Derived, not arbitrary: a file the app writes holds at most 64 distinct logos, each within the cap, plus structure. `MAX_STRUCTURE_BYTES` = 8 MiB covers 200 sections, the derived keys and the 256 KB `extensions` cap of 07 §4.4 many times over. Replaces 07's 64 MB (amendment A1) |

**Top-level rules (wall scope, P2-3b).**

| Input | Rule (07 §4.3, §4.6, §6.9) | Issue |
|---|---|---|
| `data` | plain object | else `unsupported-format` (error, M-IMP-4a) |
| `format` | absent, or `"morph-led-project"` | else `unsupported-format` (error, M-IMP-4a) |
| `version` | string `"N.M"` dispatches as above; v1 files say `"1.0"` or omit it | `newer-version` (error, M-IMP-4b) |
| `sections` | array of length 1 … `Wall.MAX_SECTIONS` | not an array: `no-sections` (M-IMP-1); empty: `no-sections` (M-IMP-2); longer: `limit-exceeded` (M-IMP-3) |
| `sections[i]` | plain object | else replaced by `{}` with `defaulted` (warning), then filled with defaults (07 §6.9) |
| `mesh_mode` | v1: `data.mesh_mode \|\| null`, and `null` keeps the current mode with no issue (legacy). `combined \| section \| panel` applies. Any other value becomes `combined` with a `defaulted` warning (07 §4.3; legacy rendered panels, B-L8) | `Mesh mode: "weird" → "combined"` |

**Per-section rules.** The JSON paths are the v1 paths, which v2 keeps verbatim (07 C1). "v1 default" is what `migrateV1toV2` fills in with the legacy `||` (so `0`, `""` and `null` take it silently, exactly as legacy import did, V-3); the validator then applies 07 §6.7 to what is left.

| Model field | JSON path | v1 default (`\|\|`, silent) | Validator (07 §6.7) | Range (`WallSection.LIMITS`) | Invalid → |
|---|---|---|---|---|---|
| `id` | `id` | `s.id !== undefined ? s.id : i` | 07 §6.8: ids are integers in [0, 2³¹−1]; the first occurrence of each keeps it; every other value (duplicate, string, fraction, negative) is renumbered from `max(valid ids) + 1` upward, and when `max + 1` would exceed 2³¹−1, `nextFree` takes the smallest unused integer instead, so re-validation never renumbers again | integer in [0, 2³¹−1], unique | `reassigned-id` (warning) |
| `name` | `name` | `` `Wall ${i + 1}` `` | numbers → `String(n)` (`coerced`); strip the 07 strip set C0, C1 and the bidi overrides (`sanitized`); truncate to 32 UTF-16 units without splitting a surrogate pair (`truncated`); **not trimmed** (amendment A3); empty after stripping → `` `Wall ${i + 1}` `` (`defaulted`) | 1 … 32 characters | as listed |
| `panelCols` | `panel.columns` | 5 | numeric strings `coerced`; fractions `rounded`; out of range `clamped`; any other type `defaulted` | 1 … 50, int | 5 |
| `panelRows` | `panel.rows` | 3 | same | 1 … 20, int | 3 |
| `panelWidth` | `panel.width_mm` | 500 | same (no rounding) | 50 … 5000 | 500 |
| `panelHeight` | `panel.height_mm` | 500 | same | 50 … 100000 (07 sanity cap; the UI gets it in P2-8a) | 500 |
| `ledX`, `ledY` | `led_resolution.x`, `.y` | 32 | same, rounded | 8 … 65536, int (07 sanity cap; UI in P2-8a) | 32 |
| `curveIntensity` | `curvature.angle_degrees` | 0 | same | −180 … 180 (07; UI clamp added in P2-8a) | 0 |
| `angleOffset` | `curvature.angle_offset_degrees` | 0 | same | −180 … 180 | 0 |
| `color` | `color` | `(palette.legacySectionColors ?? palette.sectionColors)[i % 8]` (07 C11) | `#rrggbb` lower-cased; `#rgb` expanded (`coerced`); anything else → the default (`sanitized`) | hex | default |
| – | `led_resolution.pixel_pitch_mm`, `curvature.type`, `texture_file` | – | derived: skipped on read, no issue (07 §4.2) | – | – |

After validation, `Wall.nextSectionId = max(ids) + 1` (or the smallest unused integer when that would exceed 2³¹−1, 07 §6.8), **recomputed on every import, never stored**. The legacy V-4 rule is the same formula below that bound.

**Reachability (why the app never alters its own files).** Every range above is also the UI rule (P2-8a lands first, §4.4). `WallSection.setName` applies the same `sanitizeText(raw, 32)` (P2-3b), so a typed name, even one with pasted control or bidi characters, is stored exactly as the validator would store it. The v1 writer already writes `name || Wall ${i + 1}`, so an empty model name is written as the default and reads back unchanged. The fidelity test (§8.4) asserts zero issues for every file the app writes.

### 4.4 Shared numeric rules (`js/domain/rules.js`, new in P2-8a)

```js
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));                 // P2-8a
export const roundInt = (v) => Math.round(v);                                        // P2-8a
export function deepFreeze(o) { /* verbatim copy of the LegacyCompat.js helper */ }  // P2-8a (MeshProfiles, FramingPolicy: P2-13g)
export function sanitizeText(s, maxLength) { /* 07 §6.7 strip set and truncation, no trim (A3) */ }   // P2-3b
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;                                       // P2-3b constant, used from P2-13a
export const MAX_LOGO_ASSETS = 64;                                                   // P2-3b constant, used from P2-13a
export const MAX_LOGO_DATAURI_CHARS = 32 + 4 * Math.ceil(MAX_LOGO_BYTES / 3);        // 2,796,236
export const MAX_STRUCTURE_BYTES = 8 * 1024 * 1024;
export const MAX_IMPORT_BYTES = MAX_STRUCTURE_BYTES + MAX_LOGO_ASSETS * MAX_LOGO_DATAURI_CHARS;   // 187,347,712
export const finiteOr = (v, d) => (Number.isFinite(v) ? v : d);                      // P2-8b, replaces orDefault (B-L9)
export const wrapDeg = (v) => 180 - ((((180 - v) % 360) + 360) % 360);               // P2-8c; (-180, 180]; wrapDeg(±0) = +0
```

`Wall.MAX_SECTIONS = 200` is a static of `domain/Wall.js` (07 §4.1), added in P2-3b. `WallSection.LIMITS` (07 §4.1: plain frozen data `{ field: { min, max, int, default } }`) is added in P2-8a; the `FIELD_RULES` read their bounds from it, and so does `io/ProjectSchema.js`, so the UI and the validator cannot disagree (07 D1's rule, delivered early).

**`WallSection.FIELD_RULES`**, applied to `v = parseFloat(raw)`. P2-8a adds the rounding and the caps (still on the legacy `orDefault` fallback); P2-8b swaps `orDefault` for `finiteOr`:

| Field | `LIMITS` (min, max, int) | Rule after P2-8b | Validator default |
|---|---|---|---|
| `panelCols` | 1, 50, int | `clamp(roundInt(finiteOr(v, 1)), 1, 50)` | 5 |
| `panelRows` | 1, 20, int | `clamp(roundInt(finiteOr(v, 1)), 1, 20)` | 3 |
| `panelWidth` | 50, 5000 | `clamp(finiteOr(v, 500), 50, 5000)` | 500 |
| `panelHeight` | 50, 100000 | `clamp(finiteOr(v, 500), 50, 100000)` (cap new; the input gets `max="100000"`) | 500 |
| `ledX` / `ledY` | 8, 65536, int | `clamp(roundInt(finiteOr(v, 32)), 8, 65536)` (cap new; `max="65536"`) | 32 |
| `curveIntensity` | −180, 180 | `clamp(finiteOr(v, 0), -180, 180)` (clamp new) | 0 |
| `angleOffset` | −180, 180 | `clamp(finiteOr(v, 0), -180, 180)` | 0 |

The card template adds `step="1"` to the `panelCols`, `panelRows`, `ledX` and `ledY` inputs. The caps are far above any buildable wall (aee55ac removed the old UI caps on purpose); they exist only so that every value the UI can produce lies inside the validator's range (07 Q15).

**Effect of B-L9** (entering `0`; an empty input is still NaN and still takes the default):

| Field | Before (`0 \|\| d`) | After (`finiteOr`, then clamp) |
|---|---|---|
| Camera Y | 1.5 | **0** |
| Camera Z | 5 | **0.1** (minimum) from P2-8b; **0** from P2-11c, which removes the minimum (Q13) |
| Filmback W / H | 36 / 24 | 1 (minimum) |
| Focal length | 35 | 8 (minimum) |
| Panel width / height | 500 | 50 (minimum) |
| Pixels X / Y | 32 | 8 (minimum) |
| Border thickness | 8 | 1 (minimum) |
| Logo scale % | 30 | 5 (minimum) |
| Prop scale | 1 | 0.5 (minimum) |
| Cols, rows, curve, offset, rotations, prop X/Z, font sizes | unchanged | unchanged |

**B-L10: pose writes.** Non-flat walls have valid stage space at any X and Z (the convex harness wall reaches z ≈ −1.22; rotated and box walls extend to negative Z). So no Z minimum is added anywhere, and the only position floor is the stage floor:
- `CineCamera.translateBy(dx, dy, dz)` keeps its legacy arithmetic: `posX += dx; posY = Math.max(0, posY + dy); posZ += dz`. Its B-L10 tag is retired in **P2-11c**, when the typed Z minimum is removed, so the input rule and the gizmo finally agree.
- `CineCamera.pilotFly` clamps `posY ≥ 0` (was 0.1; now the same floor as the input and the gizmo, as 07 Q10 also recommends) and does not clamp Z (P2-8c).
- Gizmo and pilot rotations go through `wrapDeg` for `rotY` (and `rotZ` for the gizmo), and clamp `rotX` to [−90, 90] (P2-8c).
- Typed inputs keep their existing clamps until P2-11c (camera Z, Q13).
- `CineCamera.resetTo` (P2-11c) follows the same rule: it may produce any Z (§6.10).
- **Far bounds (P2-13e, moved here from 07 D5).** Every camera and prop position writer (`setField`, `translateBy`, `pilotFly`, `assign`) also clamps |x| and |z| to 100,000 m and y to at most 100,000 m, the 07 §4.3 validator ranges. No harness value comes near them, so no output changes; the point is that the v2 validator can never alter a pose the app wrote.

### 4.5 Other domain additions

| Class (file) | Addition | Batch |
|---|---|---|
| `FILMBACK_PRESETS` (`domain/CineCamera.js`) | `shortName`: `'Full Frame'`, `'Super 35'`, `'ARRI LF'`, `'ARRI Alexa'`, `'RED V-RAPTOR'`, `'RED KOMODO'`, `'Sony VENICE'`, `'BMPCC 6K'`, `'APS-C'`, `'Micro 4/3'`, `'Custom'` | P2-10c |
| `CineCamera` | `presetShortName()` → `FILMBACK_PRESETS[this.filmback]?.shortName ?? 'Custom'` | P2-10c |
| `CineCamera` | `rotateBy(axis, deltaDeg, space = 'world')`, computed by quaternion composition (§6.12) | P2-9f |
| `CineCamera` | `resetTo(framing)`: position `center + 5·facing`, pan aimed at `center`, `rotY` through `wrapDeg` (§6.10); `posZ` rule without minimum | P2-11c |
| `CineCamera`, `Prop` | `assign(fields)`: the 07 §4.1 setter for **validated** values (lens and pose; never `enabled`). It applies only the far bounds of §4.4, never the UI minimums, so a v2 pose with `posZ < 0.1` survives before P2-11c. `static LIMITS` (07 §4.1) | P2-13e |
| `Wall` | `static MAX_SECTIONS = 200`; `canAddSection()` → `this.count < Wall.MAX_SECTIONS` | P2-3b |
| `Wall` | `combinedCanvasSize()` → `{ width: Σ cols·ledX, height: max rows·ledY }` (pure; mirrors `computeAtlas` totals) | P2-13b |
| `WallSection` | `static LIMITS` (§4.4); `setName(raw)` stores `sanitizeText(String(raw), 32)` | P2-8a, P2-3b |
| `LogoLibrary` | `clear()` → `this.#entries = {}` | P2-3d |
| `LogoLibrary` entries | `{ image, position, scale, dataUri, mime, bytes, name }` (P2-13a): the sanitised, possibly converted data URI is kept so the v2 writer can save it; `setImage(sectionId, image, {dataUri, mime, bytes, name})` stores the extra fields. P2-13e adds `sha256` and `assetId = 'a_' + sha256.slice(0, 16)` (07 §6.13), computed when the logo is loaded | P2-13a, P2-13e |
| `LogoLibrary` | `distinctImageCount(exceptSectionId?)` → the number of distinct `dataUri` values in use (for M-LOGO-3) | P2-13a |
| `LogoLibrary` | `set(sectionId, entry)` → `this.#entries[sectionId] = { ...entry }` (a fresh object; called only by `WallController.applyImport` when it installs imported logos, §6.17) | P2-13e |
| `domain/LogoRules.js` (new, pure) | `LOGO_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']` (07 §4.5); `parseLogoDataUri(s) → {mime, base64, bytes} \| null` (§6.16) | P2-13a |
| `TextureAtlas.computeAtlas` entries | `uvHeight = (section.panelRows * section.ledY) / totalLedY` | P2-7a |
| `TextureAtlas` | `CANVAS_HARD_LIMITS = Object.freeze({ maxSide: 32767, maxArea: 268435456 })`; `canvasFits(w, h, limits?)` | P2-1c |
| `WallMeshBuilder` | `indexWidth(maxIndex) → 'uint16' \| 'uint32'` (`maxIndex >= 65535` → `'uint32'`, §6.2); shared by `GltfExporter` and `LEDWallView` | P2-1b |
| `WallLayout` | `worldVertices()`, `columnQuads()`, `extentAcross(facing)` (§6.10); the layout's frame (stage frame for `layoutProject`'s stage layout: Feature 3 translates the walk, it never adds a root transform, 07 C32) after the Feature 2 `postTransform` (identity in Phase 2). `worldVertices()` and `columnQuads()` are **memoised per layout instance**; a layout is rebuilt once per `WALL_REBUILT`, so per-pose callers never re-derive them | P2-11a |
| `PanelNaming` | `textureFileNames(sections) → string[]` (unique); `mtlTextureFile(fileName) → 'textures/' + fileName`; `atlasTexturePath(files) → 'textures/' + files.panelIdsPng` (the injected `Theme.brand.files`; never a literal, 06 R-B3b; 04 §2.3 (b)): `textures/panel-ids.png`, then `textures/morph-led-wall-panel-ids.png` after 06 T6b | P2-6, P2-7f |
| `geometry/PreviewFit.js` (new, pure) | `clampPreviewSize(w, h)`, `letterboxRect(boxW, boxH, aspect)` (§6.14) | P2-10b |
| `core/LruCache.js` (new, pure) | `new LruCache(capacity, onEvict)`, `get`, `set`, `clear` | P2-12b |
| `Selectable` typedef (`interaction/SelectionManager.js`) | optional `allowedAxes() → {translate: ('x'\|'y'\|'z')[], rotate: ('x'\|'y'\|'z')[]}`; when absent, all axes. `PropController` returns `{translate: ['x','z'], rotate: ['y']}`. Specs 02/03 extend it to `allowedAxes(mode)`; 07's Selectable v2 keeps the name (07 C15) | P2-9d |

### 4.6 Project JSON

**v1 (P2-6a, B-M3).**
- The `'zip'` variant becomes the `'file'` literal plus `texture_file`. `curvature` now always carries `angle_offset_degrees`.
- Key order inside `curvature` stays `type`, `angle_degrees`, `angle_offset_degrees`. `texture_file` is still the last key of each section.
- `texture_file` comes from `textureFileNames(sections)[i]`, so it is unique (P2-6b). It is `null` for a section whose texture was skipped as oversize (P2-1c).

**v2 (P2-13e, B-L31). The schema is 07 §4.2 (shape, snake_case keys, key order), §4.4 (extension protocol), §4.5 (assets), §4.6 (migration) and §4.7 (validator).** This roadmap defines no format of its own: P2-13e writes the subset of 07's canonical skeleton whose state exists in Phase 2, in 07's key order, and reads every v2.0 key 07 defines. Its ranges are 07 §4.3's; §5.6.1 lists the few deliberate differences.

What P2-13e writes (`ProjectSerializer.write(project, {variant: 'file'})`, `JSON.stringify(obj, null, 2)`, no trailing newline):

```jsonc
{
  "version": "2.0",
  "format": "morph-led-project",
  "sections": [
    {
      "name": "Wall 1",
      "id": 0,
      "panel": { "columns": 5, "rows": 3, "width_mm": 500, "height_mm": 500 },
      "led_resolution": { "x": 32, "y": 32, "pixel_pitch_mm": 15.63 },
      "curvature": { "type": "flat", "angle_degrees": 0, "angle_offset_degrees": 0 },
      "color": "#00f0ff",
      "logo": { "asset_id": "a_3f9c0e1b2a7d4c55", "position": "center", "scale": 0.3 },     // or null
      "extensions": {}
    }
  ],
  "mesh_mode": "combined",
  "display": {
    "content": "color", "led_layout": "single-dot", "wireframe": false, "show_frame": false,
    "show_grid": true, "show_safe_distance": false
  },
  "panel_id_style": {
    "border_thickness": 8, "font_size": 0, "font_color": "#ffffff",
    "section_label_enabled": true, "section_label_font_size": 0, "section_label_color": "#888888"
  },
  "camera": {
    "enabled": false, "filmback": "full-frame", "filmback_width_mm": 36, "filmback_height_mm": 24, "focal_length_mm": 35,
    "position_m": { "x": 0, "y": 1.5, "z": 5 },
    "rotation_deg": { "x": 0, "y": 0, "z": 0 }
  },
  "props": {
    "person": { "visible": false, "position_m": { "x": 2, "z": 2 }, "rotation_y_deg": 0, "scale": 1 },
    "car":    { "visible": false, "position_m": { "x": 4, "z": 3 }, "rotation_y_deg": 0, "scale": 1 }
  },
  "assets": [
    { "id": "a_3f9c0e1b2a7d4c55", "kind": "logo", "name": "logo.png", "mime": "image/png", "bytes": 18234,
      "sha256": "3f9c0e1b2a7d4c55…(64 hex)", "storage": "inline", "data_uri": "data:image/png;base64,…" }
  ],
  "totals": { "sections": 1, "total_panels": 15, "total_pixels": 15360 },
  "extensions": {}
}
```

- **Superset of v1.** Every v1 key keeps its name, nesting and section-level order (07 C1), so a v1 reader that ignores unknown keys reads the same wall. Derived keys (`pixel_pitch_mm` with the v1 formula, `curvature.type`, `totals`, `texture_file`) are written and skipped on read.
- **No stored `nextSectionId`.** It is recomputed on every import (07 §6.8).
- **No timestamp** (07 C10).
- **Absent in Phase 2, by 07's own rules:**
  - feature-owned keys, which are absent until their feature's own landing commit adds them to `ProjectSchema` (07 §4.2, §4.4 rule 3, C39): `generator` (F6), `sections[].face_orientation` (F1 T9b), `offset`, `locked`, `detached` and `anchor_section_id` (F2), `uv_transform` and `pixel_map` (F4), `pivot` (F3 T7), `uv` and `atlas` (F4), `display.show_pivot_marker` (F3, from step C), `panel_id_style.brand_mark_on_export` (F6), `props.car.model` and `hdri` (F5), and spec 09's keys (`production`, `measurements`, `project.client`, `project.template_id`, `sections[].product_id`, `cabinet`, `display.inner_frustum`, the camera X3 keys). **P2-13e's manifest contains neither `face_orientation` nor `show_pivot_marker`.** Each feature release makes one revision bump, its number assigned at merge time and recorded in `ProjectSchema.REVISIONS` (07 C40);
  - `project` (name, notes) and `viewport` (orbit and preview window), whose state does not exist until 07 D5/D8. Absent means default, so 07 D5 adds them without a revision bump (amendment A5).
  The P2-13e reader nevertheless **knows every 07 v2.0 key**: it validates them with 07's rows and ignores the ones whose state does not exist yet with one `dropped-unknown` info issue per key, so a file written by a later version still opens.
- **Logos** are `assets[]` entries (07 §4.5): id `'a_' + first 16 hex of SHA-256(bytes)`, one entry per distinct image, `storage: "inline"` with `data_uri`. The hash is computed **when the logo is loaded** (`core/sha256.js`, 07 §6.13, asynchronous), and stored in the `LogoLibrary` entry, so the writer stays synchronous. In Phase 2 every variant writes logos inline; 07 D6 switches the ZIP variant to `storage: "zip"`. Both are valid v2.0.
- **ZIP variant** (`variant: 'zip'`): as above, plus each section's `texture_file` after `logo` (07 §4.2 key order; the ZIP entry path, or `null` when the texture was skipped, P2-1c). `atlas.texture_file` belongs to F4's `atlas` block and is not written in Phase 2.
- **Import (read).** Dispatch per §4.3. **v1** files keep the v1 behaviour exactly: wall only; camera, props, display and style untouched; logos reset (B-L21). **v2** files are validated per 07 §4.7 with the rule tables of §4.4 and the camera, prop and style `LIMITS`; logos are validated per §6.16; the state is restored in the order of §6.17.

---

## 5. Architecture

### 5.1 Retirement policy (applies to every commit)

1. **One bug id × one consumer per commit.** For example, B-H2 for OBJ and B-H2 for glTF are separate commits. A commit may flip several keys of one profile when they express one fix (for example `obj.winding` + `obj.normals` + `obj.stripNormals`).
2. In the same commit:
   - add the new case;
   - flip the value;
   - delete or narrow the `LEGACY(...)` tag;
   - delete the `LEGACY_SITES` entries;
   - amend ARCHITECTURE §8.1/§8.2/§8.3 and the affected module entry in §3;
   - add the `tests/regression/expected/<commit-id>.json` manifest (§8.2).
3. For `mesh.*` keys, keep the legacy case for `LegacyProfiles`. Its comment loses the `LEGACY(` prefix: `// legacy-cw: Phase-1 behaviour (B-H1, B-H2), kept for LegacyProfiles oracle tests`. This keeps rule 6 green.
4. For every other key, delete the legacy code path and the key.
5. Never combine a structural clean-up with an output change. Retirements that do not change outputs ride along with the flip; anything that moves code goes in its own commit with an empty expected manifest.
6. **Sibling specs follow the same policy and the same §8.1 procedure** for every commit that changes a golden output (§5.6).

### 5.2 Module changes by batch

Signatures are additions or changes to ARCHITECTURE §3. Unlisted methods are unchanged.

| Batch | Module (path) | Change |
|---|---|---|
| P2-0 | `js/legacy/LegacyCompat.js` | `+ export const LegacyProfiles` (§4.2) |
| P2-0 | `tests/regression/compare.mjs` | `+ --expect <file[,file…]>` (§8.2); every `--expect` run also loads `tests/regression/expected/_nondeterminism.json` (§8.1, §8.2) and reports matching diffs as `JITTER` |
| P2-0 | `tests/regression/lib/app.mjs`, `lib/recorder.mjs` | Opt-in request log: a scenario flag `recordRequests: true` writes `network.json`, every `http(s)` URL from `Network.requestWillBeSent` after the scenario's first step, excluding the app's own origin (§8.2). Used only by `p2_project_v2` |
| P2-0 | `tests/regression/scenarios-phase2.mjs` (new); `scenarios.mjs` | 8 scenarios (§8.3), registered after the Phase-0 extras |
| P2-0 | `tools/check-orientation.mjs`, `tools/check-gltf.mjs` (new, Node, no dependencies) | §8.2 |
| P2-1 | `js/io/GltfExporter.js` | Module-private `chunkedBase64(bytes)`. The `gltfBase64Encoder()` switch is deleted; the default `encodeBase64 = chunkedBase64`. `#addMesh`: `case 'auto'` for `indexType`, using `indexWidth` (§6.2) |
| P2-1 | `js/geometry/WallMeshBuilder.js` | `+ export function indexWidth(maxIndex)` (§6.2) |
| P2-1 | `js/render/LEDWallView.js` | Index attribute: `geometry.setIndex(indexWidth(maxIndex) === 'uint32' ? new THREE.Uint32BufferAttribute(indices, 1) : indices)` (P2-1e) |
| P2-1 | `js/app/ProjectIO.js` | `#runExport(label, fn)` (sync or async; catches, then `dialogs.alert(M-EXP-1)` + `win.console.warn(err)`). `exportPanelIds()` and `exportZIP()` gain size checks (§6.3). `Downloader.saveBlob` revokes via `win.setTimeout(() => URL.revokeObjectURL(href), 0)` |
| P2-1 | `js/render/textures/PanelIdRenderer.js` | `+ atlasSize(sections, atlas) → {width, height}`; `+ sectionSize(section, overrideScale) → {width, height}`; `+ panelSize(section) → {width, height}` (pure arithmetic, no canvas). P2-1d: `atlasCanvas`, `sectionCanvas` **and `panelCanvas`** return `null` when `!canvasFits` (§6.3) |
| P2-1 | `js/render/LEDMaterialFactory.js` | P2-1d: a `null` panel-ID canvas falls back to the colour material for that mesh (section, atlas or panel), with one `console.warn` per rebuild (checked by a unit-test spy; the harness does not record warnings, §2.4) |
| P2-1 | `js/geometry/TextureAtlas.js` | `+ CANVAS_HARD_LIMITS`, `+ canvasFits(w, h, limits = CANVAS_HARD_LIMITS)` |
| P2-1 | `js/io/ObjExporter.js`, `js/io/ProjectSerializer.js` | P2-1c threads `skipped: boolean[]` into `ObjExporter.write` (no `map_Kd` for a skipped section) and the serializer's `'zip'` variant (`texture_file: null`). P2-6 folds it into `textureNames`, whose skipped entries are `null` (§6.3) |
| P2-2 | `js/geometry/WallMeshBuilder.js` | `quadIndices`: `case 'ccw'`. `sectionGrid`: `case 'averaged'` with the section-level flat short-circuit of 01 CR-1 (§6.4). `+ panelNormals(panel) → number[12]`, 4× `panelFacingNormal`. `+ static PANEL_UVS = [0,0, 1,0, 1,1, 0,1]` |
| P2-2 | `js/io/ObjExporter.js` | `#stripNormalLine()` → `#stripNormalLines(normals)` with `case 'per-vertex'` (one `vn` per vertex, `toFixed(6)`); strip faces become `f a/a/a b/b/b c/c/c`. The header gains one constant line after `# Mesh Mode: …` (01 CR-3): `# Faces: counter-clockwise front faces; vn point out of the LED surface (toward the stage)` |
| P2-2 | `js/io/GltfExporter.js` | `#addMesh(name, attrs, primitives)`, where `attrs = {positions, normals?, uvs?}` and `primitives = [{indices, color, materialName}]`. Writes `NORMAL`. `doubleSided`: `case 'true'` |
| P2-3 | `js/ui/dom.js` | `+ escapeHtml(s)` (§6.5); `+ setTitleWithWarning(titleEl, name, warn)` (3 parameters; creates elements through `titleEl.ownerDocument`) |
| P2-3 | `js/legacy/LegacyCompat.js` | `- legacyHtml` |
| P2-3 | `js/io/ProjectValidator.js`, `js/io/ProjectMigrations.js`, `js/io/ProjectSchema.js` (new, pure) | The wall subset of 07 D2/D3 with 07's signatures: `validateProject(input, { limits, palette, knownRevision, exportLimits }) → { ok, project, issues }`, `detectVersion(data)`, `migrateV1toV2(data, { palette })`, the schema rows for `sections` and `mesh_mode`, `sectionsFromProject(project)` (§4.3) |
| P2-3 | `js/io/ProjectSerializer.js` | `read(data, { exportLimits } = {}) → { ok, project, issues, sourceVersion, scope }` (07 §5.5.1). The `importValidation` switch is deleted |
| P2-3 | `js/app/ProjectIO.js` | `importFromInputEvent`: the size check (M-IMP-6) before reading, `reader.onerror` (M-IMP-7), the alert on `!ok`, `wallController.applyImport({ sections, meshMode, logos: null })` for scope `'wall'`, then M-IMP-5 if there are warnings (§4.3) |
| P2-3 | `js/app/WallController.js` | `applyImport({ sections, meshMode, logos = null })`: `project.logos.clear()`; if `logos` is given, `project.logos.set(id, entry)` for each; then `wall.replaceAll` and the rebuild (B-L21; the `logos` argument is used by the v2 restore, §6.17). `addSection()`: `if (!project.wall.canAddSection()) { dialogs.alert(M-SEC-1); return }` (`dialogs` injected) |
| P2-3 | `js/domain/WallSection.js`, `js/domain/Wall.js` | `setName(raw)` stores `sanitizeText(String(raw), 32)`; `Wall.MAX_SECTIONS = 200`, `canAddSection()` |
| P2-3 | `js/ui/SectionLogosPanel.js` | The `WALL_SECTIONS_CHANGED` subscriber renders when `project.display.panelIdsEnabled`, **including** `reason === 'import'`. All templates use `escapeHtml` |
| P2-3 | `js/ui/SectionListPanel.js` | All template interpolations go through `escapeHtml`. The live rename and `#patchCard` use `setTitleWithWarning` |
| P2-3 | `js/render/LEDWallView.js`, `ObjExporter`, `GltfExporter` | The mode dispatch becomes `combined` / `section` / `panel`, and any other value throws `Error('Unknown mesh mode')` (unreachable after validation) |
| P2-4 | `js/interaction/PilotController.js` | `toggle()`: the guard applies only when entering (`if (!interaction.pilotMode && !cine.enabled)`) |
| P2-4 | `js/app/CameraController.js` | `setPreviewEnabled(false)`: after `rig.remove()`, call `hub.syncSafeDistance()` |
| P2-4 | `js/render/CameraRigView.js` | `remove()` nulls `bodyMesh` (§2.2 observation) |
| P2-5 | `js/geometry/SafeDistanceBand.js` (new, pure) | `export function buildSafeDistanceBand(input, D, { lift = 0.005, lineLift = 0.02, eps = 0.001 }) → {positions, colors: 'wall'\|'threshold'\|'clamped' per vertex, indices, outline: {x,z}[], labelAnchor: {x,z}, clampedVertices: number, totalSafeVertices: number}` (§6.9). `input` is one run, `{points, facing, sectionOfVertex}` (02 §6.12, CR-08-a: the polyline, the σ = ±1 of each segment, and the section(s) of each vertex), or a `WallLayout`, which is wrapped as the single run of `layout.flatEdges()` (σ from 01's `layout.flatEdgeFacing()` once Feature 1 adds it, +1 before). P2-5b passes the layout; Feature 2 passes each of its `floorRuns()` |
| P2-5 | `js/render/SafeDistanceView.js` | `create()` wraps `buildSafeDistanceBand` in THREE objects (same allocation order: mesh, line, sprite); the `'clamped'` colour is `theme.scene.safeDistanceClamped` (new key, `#ffaa00`, the existing off-centre amber; Feature 6 restyles it). It keeps the last result as `lastBand` for the exporter |
| P2-5 | `js/io/ObjExporter.js` | `writeSafeDistance(group, band)` writes `vn` from `geometry.attributes.normal`, faces `f a//a b//b c//c`, and, when `band.clampedVertices > 0`, the header line `# Clamped: ${n} of ${total} offset vertices are closer than D = ${D.toFixed(2)} m (concave features)` |
| P2-5 | `js/app/ProjectIO.js` | `exportSafeDistanceOBJ()` → `downloader.saveBlob(blob, brand.files.safeDistanceObj)`. `legacyMissingDownloadBlob` is deleted |
| P2-6 | `js/io/ProjectSerializer.js` | `write(project, {variant, textureNames?})` (the `'zip'` variant requires `textureNames`; a `null` entry writes `texture_file: null`) |
| P2-6 | `js/geometry/PanelNaming.js` | `textureFileNames(sections)` (§6.6). `zipTextureFileName` is deleted; `mtlTextureFile(fileName)` |
| P2-6 | `js/io/ObjExporter.js` | `write({sections, meshMode, layout, textureNames = null})`: `map_Kd` only when `textureNames` is given and the entry is not `null` |
| P2-6 | `js/app/ProjectIO.js` | `exportZIP` computes `names = textureFileNames(sections)` once, nulls the skipped ones (§6.3) and passes them to the serializer, the OBJ writer and the texture loop. `exportOBJ` passes no names |
| P2-7 | `js/geometry/TextureAtlas.js` | entries `+ uvHeight` |
| P2-7 | `js/geometry/WallMeshBuilder.js` | uv option `{offsetU, widthU, heightV?}`; `combinedGrid`: `case 'atlas-pixel-accurate'`; returns per-section `vertexStart/vertexCount` (04 §5.3) |
| P2-7 | `js/io/ObjExporter.js` | Combined: `case 'atlas-pixel-accurate'` uses the builder atlas UVs. Per-section `newmtl Wall_<i+1>` and `usemtl` before each section's face block (§6.8) |
| P2-7 | `js/io/GltfExporter.js` | Writes `TEXCOORD_0` (v flipped, §6.7); the combined UVs come from the new profile leaf `mesh.gltf.combinedUV` (`case 'atlas-pixel-accurate'`, §4.1). Combined: one mesh `LED_Wall_Combined` with one primitive per section, each with its own accessors (§6.8) |
| P2-7 | `js/app/ProjectIO.js` | P2-7f: `exportZIP` always renders the atlas to `atlasTexturePath(brand.files)` (`textures/panel-ids.png` in Phase 2) when `canvasFits` passes, in every mesh mode, and passes `atlasFile` to the OBJ writer only in combined mode (§6.3, 04 §2.3 (b)) |
| P2-7 | `js/render/LEDMaterialFactory.js` | `combined()` LED-sim: `MeshBasicMaterial({map, vertexColors: true, side, wireframe})` with a white tile |
| P2-7 | `js/render/textures/LEDPixelTextureFactory.js` | Cache key `` `${new THREE.Color(color).getHexString()}-${layout}` `` |
| P2-8 | `js/domain/rules.js` (new in P2-8a) | §4.4. P2-8a: `clamp`, `roundInt`, `deepFreeze`; `WallSection.LIMITS` and the capped, rounding `FIELD_RULES`. P2-8b: `finiteOr`; `orDefault` is deleted from `LegacyCompat`. P2-8c: `wrapDeg` |
| P2-8 | `WallSection`, `CineCamera`, `Prop`, `PanelIdStyle`, `LogoLibrary` | Rules use `finiteOr`, `roundInt`, `clamp`, `wrapDeg` |
| P2-8 | `js/app/WallController.js` | `setMeshMode(mode)`: `if (mode === project.meshMode) return;` (B-L13). The label click handler still sets the classes first |
| P2-9 | `js/interaction/ViewportInput.js` | `attachPointer`: pending-click state `{x, y, button, armed}`; picking moves to `mouseup` (§6.11). `attachShortcuts`: the modifier and repeat filters |
| P2-9 | `js/core/typingTarget.js` (new, P2-9b) | `isTypingTarget(t)` with **07 §3.8's truth table** (it adds `SELECT` and `isContentEditable` to the legacy check). This roadmap is its one named owner (07 C18, C52); 01 T7 and 07 I1 only consume or extend it |
| P2-9 | `js/interaction/InputState.js` | `isShortcutIgnoredTarget` becomes a re-export of `isTypingTarget` until 07 I1 deletes it. `+ CLICK_TRAVEL_PX = 4` |
| P2-9 | `js/interaction/SelectionManager.js` | `pickAt(event)` is unchanged except that it is now called from `mouseup` |
| P2-9 | `js/interaction/TransformGizmo.js` | `onMouseMove`: `target.applyGizmoRotate(axis, angle, space)`. `rebuild()` builds only `target.allowedAxes?.()` handles and sets `group.visible = !interaction.pilotMode`. `+` subscribes `PILOT_CHANGED` (mirror: its own group's `visible`). The `SELECTABLE_MOVED` handler also calls `updateOrientation()` when `space === 'local'` |
| P2-9 | `js/app/CameraController.js`, `PropController.js` | `applyGizmoRotate(axis, deltaDeg, space)` |
| P2-9 | `js/domain/eulerYXZ.js` (new, pure) | `quatFromEulerYXZDeg(x, y, z)`, `eulerYXZDegFromQuat(q)`, `quatFromAxisAngleDeg(axis, deg)`, `quatMultiply(a, b)` |
| P2-9 | `js/render/SceneManager.js` | `startLoop(tick)` passes `dt` in seconds, clamped to **[0, 0.1]**; the first synchronous frame uses `dt = 0` (§6.13) |
| P2-9 | `js/interaction/OrbitController.js`, `PilotController.js` | `tickKeyboard(dt)` |
| P2-9 | `js/ui/ViewportToolbar.js` | View-preset clicks: `if (interaction.pilotMode) pilot.toggle();` then `orbit.setView(view)` (B-L25, §3.5) |
| P2-10 | `js/render/PreviewWindow.js` | `render(scene, helpers)` hides the helpers during the render (§6.14). The canvas is sized to the window's inner box; the image is letterboxed with `setViewport`/`setScissor` (§6.14). The resize handle clamps both axes. The labels use `presetShortName()` and the drawn size |
| P2-10 | `js/geometry/PreviewFit.js` (new, pure) | `clampPreviewSize`, `letterboxRect` (§6.14) |
| P2-10 | `js/app/App.js` | The tick passes `sceneManager.helpers` to `preview.render` |
| P2-11 | `js/geometry/FrustumCoverage.js` (new, pure) | `analyzeCoverage(layout, cameraPose, lens) → {status, frameWidth, frameHeight, distance, cornerDepths: number[4], centreDepth}` over the memoised `layout.columnQuads()` (§6.10). `cornerDepths` are **camera-space depths** in the order TL, TR, BR, BL, already resolved through the fallbacks (hit, else `D0`, else 15 m) |
| P2-11 | `js/geometry/WallLayout.js` | `+ worldVertices()`, `+ columnQuads()` (both memoised per instance), `+ extentAcross(facing)`. `framingBounds`: `case 'layout'` returns `{min, max, center, width, height, facing}` from `FramingPolicy`'s three named boxes (§6.10, 07 C34); each consumer names its box |
| P2-11 | `js/domain/CineCamera.js` | `coverage()` is deleted (it moves to `FrustumCoverage`). `resetTo(framing)` uses `center` and `facing`, `rotY` through `wrapDeg` (§6.10). `FIELD_RULES.posZ` loses its 0.1 minimum (Q13) |
| P2-11 | `js/render/CameraRigView.js` | `rebuildFrustum(cine, cornerDepths)` builds the far corners at camera-space `(sx·tx·z, sy·ty·z, −z)` with `z = cornerDepths[c]`, and records, while building, every vertex index at which each far corner is written, in the `LineSegments` **and** in the fill mesh (`#farSlots`, §6.10). `+ updateFrustumDepths(cornerDepths)` rewrites every recorded slot of both geometries in place (`setXYZ`, `needsUpdate`, `computeBoundingSphere()`), used by P2-12c |
| P2-11 | `index.html` (camera panel) | `#camera-pos-z`: `min="0.1"` removed; label "Z Position (m)" (Q13) |
| P2-12 | `js/render/LEDWallView.js`, `LEDMaterialFactory.js` | P2-12d: panel mode **with panel IDs** uses one material per section (`materials.sectionShared(section, i, startCol)`, 04 §6.12) plus a per-panel UV remap (§6.15). Panel mode with LED sim or colour is unchanged (per-panel 0..1 UVs, 04's "LED sim keeps per-panel UVs") |
| P2-12 | `js/geometry/TextureBudget.js` (new, P2-12d; 07 X3's module delivered early, 07 C25, C38) | `SECTION_TEXTURE_BUDGET_PX = 16,777,216` per rebuild (04 UV-7; every mode that uses section canvases); `PANEL_TEXTURE_BUDGET_PX = 33,554,432` **wall-wide**, used only with 04's `uv.panel_uvs = 'panel'` option; each canvas side ≤ min(`maxTextureSize`, 4096); `panelModePxPerLed` (§6.15). Export density is unchanged; 05's HDRI limits stay in `HDRI_LIMITS` and report into the same perf HUD |
| P2-12 | `js/geometry/TextureAtlas.js`, `js/render/textures/PanelIdRenderer.js` | P2-12d: `panelPxPerLed` applies the **wall-wide** panel budget of 07 §6.12 (`panelModePxPerLed` over `wallPanelLeds` summed over the sections, one `pxPerLed` for the whole rebuild; each canvas side ≤ min(`maxTextureSize`, 4096)), which retires B-M16 at both tags. `panelCanvas` stays for 04's later `uv.panel_uvs = 'panel'` option and keeps only its B-L19 tag |
| P2-12 | `js/render/textures/LEDPixelTextureFactory.js` | P2-12b: masters in an `LruCache(64)`; eviction disposes the texture |
| P2-12 | `js/app/CameraController.js` | P2-12c: `CameraHub.refresh({poseOnly = false})`. A pose-only refresh **skips only `syncSafeDistance`** (D and the band do not depend on the pose) and replaces `rig.rebuildFrustum` with `rig.updateFrustumDepths(analysis.cornerDepths)`. Lens changes (filmback, focal) call the full refresh |
| P2-13 | `js/render/textures/LogoLoader.js` (new; uses the injected `win`) | `async load({file?, dataUri?}) → {ok, image, dataUri, mime, bytes, name, sha256?, reason}`: allowlist, size cap on the file **and on the stored bytes after conversion** (with the downscale loop for converted rasters), SVG sanitising and sizing, decode check (§6.16). P2-13e adds `sha256` (injected `digest = (bytes) => sha256Hex(bytes, {subtle: win.crypto?.subtle})` from `core/sha256.js`). Injected into `SectionLogosPanel` (upload) and `ProjectIO` (import) |
| P2-13 | `js/ui/SectionLogosPanel.js`, `PanelIdRenderer.js` | Upload through `LogoLoader`; the distinct-image check (M-LOGO-3); zero-size drawing guard (§6.16) |
| P2-13 | `js/app/WallController.js` | P2-13b: computes `textureStatus = {atlasWidth, atlasHeight, atlasOver4K, atlasFits, undisplayable: string[]}` (it may import `geometry/`) and adds it to the `WALL_REBUILT` payload |
| P2-13 | `js/ui/WallDisplayPanel.js` | P2-13b: owns `#wall-texture-warning`; subscribes `WALL_REBUILT` and renders from `payload.textureStatus` only (no `geometry/` import) |
| P2-13 | `js/ui/dom.js` | P2-13c: `+ setToggle(el, on)` (§6.18); `flipToggle(el)` is re-implemented as `const on = !el.classList.contains('active'); setToggle(el, on); return on;`, so every existing click handler keeps its call and gets `aria-checked` for free |
| P2-13 | `js/io/ProjectSerializer.js`, `js/io/ProjectSchema.js`, `js/io/ProjectValidator.js`, `js/io/ProjectMigrations.js`, `js/core/sha256.js` (new) | P2-13e: the v2 path of 07 §4.2–§4.7 for the Phase-2 keys. `write(project, { variant: 'file' \| 'zip', textureNames? })` emits 07's key order (§4.6); `read` gains the v2 dispatch. `core/sha256.js` is 07 §6.13's `sha256Hex(bytes, {subtle})` (07 D6's file, delivered early) |
| P2-13 | `js/app/ProjectIO.js` | P2-13e: `+ #applyV2(result)` (§6.17); new deps `cameraController`, `propControllers: {person, car}`, `pilot`, `selection`, `interaction` (read-only, for `pilotMode`), `logoLoader`, `bus`. It never emits pose events itself |
| P2-13 | `js/app/CameraController.js` | P2-13e: `+ applyImportedPose({posX, posY, posZ, rotX, rotY, rotZ})`: `cine.assign(pose)`, `bus.emit(CAMERA_POSE_CHANGED, {source: 'import'})`, `if (cine.enabled) hub.refresh()`, else `#keepPoseOnNextEnable = true`. `setPreviewEnabled(true)` skips `resetPose()` once when that flag is set, then clears it (§6.17, Q19) |
| P2-13 | `js/app/PropController.js` | P2-13e: `+ applyImportedPose({posX, posZ, rotY, scale})`: `prop.assign(fields)`, `bus.emit(PROP_POSE_CHANGED, {id, source: 'import'})`, `applyTransform()` |
| P2-13 | `js/ui/WallDisplayPanel.js`, `CameraPanel.js`, `PropControls` | P2-13e: `syncFromModel()`, subscribed to `PROJECT_REPLACED` |
| P2-13 | `js/geometry/MeshProfiles.js`, `js/geometry/FramingPolicy.js` (new) | P2-13g: §4.1 |

### 5.3 New modules

Pure (no THREE, no DOM; Node unit-tested): `js/io/ProjectValidator.js`, `js/io/ProjectSchema.js`, `js/io/ProjectMigrations.js` (all three from P2-3b, extended in P2-13e), `js/core/sha256.js` (the pure-JS path; the `subtle` path is used only when the caller injects it), `js/geometry/SafeDistanceBand.js`, `js/geometry/FrustumCoverage.js`, `js/geometry/PreviewFit.js`, `js/geometry/MeshProfiles.js`, `js/geometry/FramingPolicy.js`, `js/domain/rules.js`, `js/domain/eulerYXZ.js`, `js/domain/LogoRules.js`, `js/core/LruCache.js`.

Not pure: `js/render/textures/LogoLoader.js` (uses the injected `win` for `Image`, `DOMParser`, `XMLSerializer`, `Blob` and `URL`; covered by the `p2_project_v2` and `logos` scenarios).

Each one follows the file header and JSDoc conventions (ARCHITECTURE §1.5) and the layer table (§1.3).

### 5.4 Events

Phase 2 adds **one event** (P2-13e) and new **subscribers** to existing events. Each subscriber is a mirror that obeys R3 and writes only its own targets. Every event keeps its ARCHITECTURE §5.2 emitter: pose events are emitted only by the controllers at their model-write points, never by `ProjectIO`.

| Event | Change | Emitted by | Subscriber | Writes |
|---|---|---|---|---|
| `project:replaced` (`PROJECT_REPLACED`), **new** in P2-13e | Payload `{reason: 'import', scope: 'full'}`, the 07 §5.10 name and shape | `ProjectIO.#applyV2`, as its last step (§6.17), until 07 D5 moves it to `ProjectSession.apply` **step 8** (07 §5.5.2 is the numbering of record, C41). v1 imports keep `WALL_SECTIONS_CHANGED{import}` only | `WallDisplayPanel`, `CameraPanel`, `PropControls` ×2: `syncFromModel()` | their own toggles, radios, selects and inputs |
| `WALL_SECTIONS_CHANGED{import}` | – | `WallController.applyImport` (existing) | `SectionLogosPanel` (removes the B-L21 exclusion) | `#section-logos-container` |
| `PILOT_CHANGED` | – | `PilotController` (existing) | `TransformGizmo` | `group.visible` |
| `WALL_REBUILT` | Payload gains `textureStatus` (P2-13b) | `WallController` (existing) | `WallDisplayPanel` (B-L17) | `#wall-texture-warning`. Bus rule 7's exception for `WALL_REBUILT` ("no subscriber") is lifted |
| `CAMERA_COVERAGE_CHANGED` | Payload gains `status: 'offWall'` and allows `frameWidth`/`frameHeight` = `null` when `D0` is null | `CameraHub` (existing) | `CameraPanel` (existing) | `#frustum-*` |
| `CAMERA_POSE_CHANGED` | `source` gains `'import'` (P2-13e) | `CameraController.applyImportedPose` (new model-write point, §5.2) | `CameraPanel` (existing) | inputs, written at `toFixed(2)` like `'gizmo-translate'` |
| `PROP_POSE_CHANGED` | `source` gains `'import'` (P2-13e) | `PropController.applyImportedPose` (new model-write point) | `PropControls` (existing) | inputs, written at `toFixed(2)` |

### 5.5 Contract amendments (to be made in ARCHITECTURE.md / REFACTOR_PLAN.md, by the commit named)

| Amendment | Commit |
|---|---|
| R13 "no new try/catch": `ProjectIO.#runExport` and the export size guards are the sanctioned exceptions | P2-1a |
| R1/R8 verbatim templates: `SectionListPanel` / `SectionLogosPanel` interpolate through `escapeHtml`; the card template gains `step="1"` and the `max` attributes | P2-3a, P2-8a |
| §1.4 world conventions: "triangles are wound counter-clockwise seen from the front (+Z for a flat wall); normals point to the stage" | P2-2a |
| §1.4: the curve convention (B-L1) becomes documented behaviour, as soon as the owner's Q10 answer is recorded (Phase 2 kickoff); P2-13f retires the switch | Q10 record; P2-13f |
| §1.4 (07 C60, D0): the frame each consumer uses (stage frame from `WallController.currentLayout`; export frame from `layoutProject({frame: 'export'})`) | 07 D0 |
| §3 `WallController.applyImport({sections, meshMode, logos = null})`; `Wall.MAX_SECTIONS`; `WallSection.LIMITS`, `setName` sanitising | P2-3b, P2-3d, P2-8a |
| §3 `CameraController.applyImportedPose`, `PropController.applyImportedPose`, `CineCamera.assign`, `Prop.assign`; `setPreviewEnabled(true)` keeps an imported pose once | P2-13e |
| §3 `ui/dom.js`: `setToggle`; `flipToggle` re-implemented on it | P2-13c |
| §5.1 rule 7: `WALL_REBUILT` gains its first subscriber; §5.2 gains `PROJECT_REPLACED` and the `'import'` pose sources with their emitters | P2-13b, P2-13e |
| §6.2 row 8: one rebuild per mesh-mode click | P2-8d |
| §6.3 P2: `refresh({poseOnly})` skips `syncSafeDistance` and updates the frustum in place on pose-only calls | P2-12c |
| §8.4: the residual B-L7 observation (second download may be blocked) | P2-6c |
| **§9 Feature 1 row:** "flip all three profiles in one commit, re-baseline exports" becomes "the flips are Phase-2 commits P2-2a–d (one consumer per commit; `docs/improvements/08-bugfix-roadmap.md`); Feature 1 adds the debug view and options only" | P2-2a |
| **§9 Feature 2 row:** "select-on-click (B-M14 fix)" is delivered by P2-9a, and Feature 2 reuses it. For "safe distance per section", P2-5b delivers the band builder over one polyline; Feature 2 adds `floorRuns()` and calls it once per run (02 §6.12, CR-08-a) | P2-9a |
| **§9 Feature 3 row:** "switch `framingBounds` to pivot/bounds (fixes B-L2)" becomes "`framingBounds = 'layout'` (P2-11c) is pivot-aware through `layoutProject`" | P2-11c |
| **§9 Feature 4 row:** the `'atlas-pixel-accurate'` strategies (including the new `mesh.gltf.combinedUV` leaf) and glTF `TEXCOORD_0` are P2-7a–c; the viewport panel-ID path of panel mode is P2-12d | P2-7a, P2-12d |
| §10 golden master: "baseline = parent commit's output (Phase 2+); every golden-changing commit, in any spec, carries an expected-change manifest; `expected/_nondeterminism.json` is the only standing allowance" | P2-0 |
| **REFACTOR_PLAN §5:** the Phase 2 list is rewritten to this roadmap's merge order and batch membership (§1 table): P2-5a, then P2-1 (B-H3), then P2-2 (adding `NORMAL` puts `large_wall`'s glTF at 121,056 B, inside the `RangeError` band); B-L33 in P2-11 and B-M15 in P2-5b | P2-0 (07 0.4) |
| `tests/static/check.mjs` rule 8 rewritten for `MeshProfiles`/`FramingPolicy` | P2-13g |
| REFACTOR_PLAN §6: "Baselines change only in Phase 2/3, one intended change per commit, each with an expected-change manifest" | P2-0 |

### 5.6 Bug ownership across specs (authoritative)

Several sibling specs propose fixes for the same bug ids. This table decides, for each id, which document is authoritative for the **design** and which commit lands it. Every golden-changing commit, in any spec, uses the §8.1 procedure. "Amend" lists what the sibling spec must change; those specs are edited by their own workflows, not by this one.

| Bug ids | Authoritative design | Commit(s) | Sibling text superseded → amendment |
|---|---|---|---|
| B-H1, B-H2, B-L3 | **08** §6.4, with 01 CR-1 (flat short-circuit) and CR-3 (OBJ header line) adopted | P2-2a–d (one consumer per commit) | **01** steps A/B (T3, T4) are implemented by P2-2a–d; 01 keeps the debug view, the LED side option and the back shell. 01 §8 must use `LegacyProfiles` (not `LEGACY_MESH_PROFILES`) and §8.1 here (no `--only` promotion). `tools/check-orientation.mjs` (01 §8.1) ships in P2-0. 01 CR-2 is met by the `each` patterns of P2-2c/d. ARCHITECTURE §9 F1 row amended (§5.5) |
| B-L29 | **08** §6.9 | P2-5b, together with B-M15 | **01** step D (`safeDistanceBand: 'per-column-own-normal-up'`) is dropped: the key is retired by P2-5b |
| B-H3, B-L5, B-L4 | **08** §6.1–§6.3 | P2-1a–e | **07** E3/X3 build on these (toasts, `CanvasProbe`, `TextureBudget`); their "retire" lines for these ids become no-ops. 07's `CanvasProbe` later replaces `CANVAS_HARD_LIMITS` with probed device limits for the viewport guard (for example iOS Safari's ≈ 16.7 MP area) |
| B-M4, B-L8, B-L16, B-L21 | **07** §4.6–§4.7, §5.5.4, §6.7–§6.9 for the contracts; **08** §4.3, §6.5 for the Phase-2 wall subset and its messages | P2-3a–d; the v2 path in P2-13e | **07** D7 is P2-3a. **07** D2 and D3 are implemented for the wall keys by P2-3b in their final modules and signatures; 07 D2/D3 then add the remaining rows, the fuzz tests and the `budget` check. 07's `WallController.applyImport` removal (D5) also removes the `logos` argument P2-3d/P2-13e add |
| B-H4, B-M8 | **08** | P2-4a–b | – |
| B-M1, B-M15 | **08** §6.9 | P2-5a (before P2-1a), P2-5b | **02** §6.12 per-floor-run band reuses `buildSafeDistanceBand` per run |
| B-M3, B-M2, B-L14, B-L7 | **08** §6.6 | P2-6a–d | **04** §7.1 uses `textureFileNames` (the deleted `zipTextureFileName` is gone) and P2-6c's rule "standalone MTL: no `map_Kd`" (04 §2.3 (c) agrees). The v2 ZIP variant keeps the v1 key `texture_file` (07 §4.2) |
| B-M5, B-M6, B-M7, B-L6, B-L18 | **08** §6.7–§6.8, implementing the binding decisions of **04** §2.3 (B-M5/B-M6/B-M7 rows, (a) per-primitive accessors, (b) the atlas file and its shipping rule, (c) standalone MTL) | P2-7a–f (04 withdrew its earlier UV-1..UV-4; these 08 commits own them) | 04 §8.3's `--only` captures are replaced by §8.1 here. 04's requested manifest additions are met by the `each` patterns of P2-7c/d/f (§10). The atlas entry is `'textures/' + Brand.files.panelIdsPng` (`textures/panel-ids.png`; `textures/morph-led-wall-panel-ids.png` after 06 T6b, whose `--rename` map covers the ZIP entry path, the MTL `map_Kd`, glTF `images[].uri` and JSON `atlas.texture_file`), never a literal (06 R-B3b), and ships whenever `canvasFits` passes, in every mode; the MTL references it only while the UVs are atlas-placed (combined in Phase 2). New leaf `mesh.gltf.combinedUV` (§4.1). 04 UV-7/UV-8a/UV-8b add the `'plan'` case to the three `combinedUV` leaves |
| B-L15 | **08** §4.4 | P2-8a, merged **before** P2-3b | – (04 §2.3 (d) agrees: UI rounding and caps in P2-8a, the import rows in the validator) |
| B-L9, B-L10, B-L13 | **08** §4.4 | P2-8b–d; B-L10's Z half in P2-11c; the ±100,000 m writer bounds in P2-13e | **07** I3/I4 and X1 lines for these ids become no-ops; 07 Q10 (pilot floor 0) agrees. 07 D5's writer-clamp item is done by P2-13e. **03**'s camera Z rule (`posZ ≥ wallZ + 0.1`) is deleted if Q13 is accepted |
| B-M14, B-L11, B-M12, B-L22, B-L23, B-L28, B-M13, B-L27, B-L25, B-L26 | **08** §6.11–§6.13; B-L25 adopts **07** §3.7 (a preset exits pilot first) | P2-9a–j | **07** I1–I4 later re-implement input on `TransformControls`/`OrbitControls` (07 Q2); the P2-9 criteria become their regression criteria |
| B-M11, B-M9, B-L32, B-L34 | Window geometry and letterbox: **07** §3.6/§6.1 (05 §5 agrees); helper hiding and labels: **08** §6.14 | P2-10a–c (in the existing second renderer) | **07 C31 is the binding statement of the either-order rule** (adopted). **07** R1/R2 later replace the mechanism (single renderer, layers) and keep the same window geometry and labels. If R1/R2 land first, P2-10a/b are dropped and P2-10c's label work moves into `PreviewPass` (07 §5.11 relocates that row). 07 §3.6's drawn-size label is adopted |
| B-M10, B-L33, B-L2 | **08** §6.10 | P2-11a–c | **03** step F follows §6.10 (it says so); it is empty once P2-11c has landed |
| B-H5, B-L12 | Phase 1C H1/H2 | H1/H2, else P2-12a | – |
| B-L20, B-L30 | **08** | P2-12b–c | – |
| B-M16 | **08** §6.15 | P2-12d: the default viewport path no longer reaches per-panel canvases, and `panelPxPerLed` gets 07 §6.12's **wall-wide** budget from `geometry/TextureBudget.js`, which P2-12d creates (07 C25, C38). The B-M16 id leaves both tags | **04** §5.5 expected exactly this ("B-M16 id retired by P2-12 (budget)"). **07** X3's B-M16 line becomes a no-op; X3 extends P2-12d's `TextureBudget` and adds the probe |
| B-L19 | Viewport panel-ID path: **08** §6.15 (P2-12d). Export UVs and the user option: **04** UV-9 | P2-12d; 04 UV-9 | **Split of 04 UV-9:** P2-12d owns `materials.sectionShared` and the `PlaneGeometry` uv overwrite **for panel IDs** in the viewport. 04 UV-9 keeps the panel-mode export UVs (OBJ `vt`, glTF `TEXCOORD_0` from `panelUvs`), the `uv.panel_uvs` setting (`'section'` default \| `'panel'`) and its persistence; with `'panel'` the viewport goes back to `panelCanvas`, which keeps the B-L19 tag with the text "reachable only with `uv.panel_uvs = 'panel'`" (04 §5.5). LED sim and colour in panel mode keep per-panel UVs (04: `toggles/06_ledsim_panel` unchanged) |
| B-L35 | **08** §6.16 | P2-13a | **07** E3/D6 wrap the same loader in `AssetStore` later; `AssetStore.addFile` adopts its conversion, sanitising and post-conversion cap |
| B-L17 | **08** §3.4 | P2-13b | – |
| B-L36 | **08** §3.5, §6.18 | P2-13c | **07** X1 adopts `setToggle` and the re-implemented `flipToggle` |
| B-L24 | **01** T7 (`.view-btn.active`) and **06** T4a (badge placement) | 01 F1-2, 06 T4a (07 C52, the named owners) | **07** X1 does not re-fix it. P2-13d's fallback is dropped |
| B-L31 | **07** §4.2–§4.7 | P2-13e: the `file` and `zip` variants for the Phase-2 keys; 07 D4 adds the `history` and `autosave` variants, D5/D6/D8 the rest | the deliberate differences are §5.6.1 A1–A5. **A4 is adopted:** 07 §5.5.2 `ProjectSession.apply` restores the poses through `applyImportedPose` in step 5, **after** the preview step 4 (07 C30) |
| B-L1 | **08** (decision, Q10, **answered at Phase 2 kickoff** and recorded here: **keep the convention**, owner decision of 2026-10-16; ARCHITECTURE §1.4 documents it) | the decision: Phase 2 kickoff; P2-13f's code may land at any time after it | 07 C6: v2.0 files carry no convention key; amendment A6. 02 T3 is gated only on the recorded decision |

**Mapping to spec 07's tasks.** The parts of 07 that Phase 2 needs are built here, in 07's final modules and with 07's signatures, so 07 extends them instead of replacing them:

| 07 task | Delivered here | What remains for 07 |
|---|---|---|
| D7 (XSS) | P2-3a | rule S1 of the static check |
| D1 (`LIMITS`, `FIELD_RULES` reading them, sanity caps, section cap) | P2-8a (`WallSection.LIMITS`, caps), P2-3b (`Wall.MAX_SECTIONS`), P2-13e (`CineCamera.LIMITS`, `Prop.LIMITS`, `ProjectSchema` rows for the Phase-2 keys) | `core/AppInfo.js`; the disabled Add Section button |
| D2, D3 (validator, migration) | P2-3b (wall keys), P2-13e (v2 path, Phase-2 keys) | feature rows, fuzz and reachability property tests, `budget` |
| D4 (serializer) | P2-13e (`file`, `zip`) | `history`, `autosave` variants |
| D5 (session) | P2-13e: the writer bounds, `PROJECT_REPLACED`, `syncFromModel()` on 4 panels, `assign` | `ProjectSession` (replacing `#applyV2` and `applyImport`), `project` and `viewport` keys, the other panels' `syncFromModel()` |
| D6 (assets) | P2-13e: `core/sha256.js` | `AssetStore`, ZIP storage, ZIP open |
| E3 (export guards) | P2-1, P2-5a | toasts, busy state, `CanvasProbe` |

#### 5.6.1 Deliberate differences from spec 07 (amendments 07 must adopt)

Each item is something this roadmap must decide before 07's own task lands. 07's owner applies them to 07 §4.3/§4.7/§5.5.2 before implementation (R11).

| # | 07 says | This roadmap does | Why |
|---|---|---|---|
| A1 | `too-large`: "JSON over 64 MB" (07 §4.7) | `MAX_IMPORT_BYTES` = 187,347,712 bytes (≈ 179 MB), derived from `MAX_LOGO_ASSETS` × `MAX_LOGO_DATAURI_CHARS` + 8 MiB of structure (§4.3) | 64 inline logos of 2 MB each make a 179 MB file the app itself can write; a 64 MB cap would refuse it, breaking 07's own fidelity rule |
| A2 | `assets[] ≤ 64` is a validator limit; nothing stops the 65th distinct upload | The upload refuses a 65th distinct logo image (M-LOGO-3, P2-13a); the 2 MB cap is measured on the stored bytes after conversion (§6.16) | Reachability: a limit the validator enforces must also be a UI limit (07 §4.3) |
| A3 | `string()` trims every string (07 §6.7) | Section names are not trimmed; `project.name` still is | The UI rename never trimmed, so trimming on read would alter files the app writes. The strip set (C0, C1, bidi overrides) and the 32-unit truncation are adopted unchanged and also applied by `WallSection.setName` |
| A4 (**adopted** by 07 r3: preview step 4, poses step 5, C30) | 07 r2: `ProjectSession.apply` step 3 assigns the camera pose before step 4 `setPreviewEnabled`, which calls `resetPose()` (07 §5.5.2) | The pose is applied after the enable, through `CameraController.applyImportedPose`, which emits `CAMERA_POSE_CHANGED{import}` and keeps a pose restored while the preview is off for the next enable (§6.17) | Otherwise every imported camera pose with `enabled: true` is lost, and the pose of a disabled camera is meaningless |
| A5 | The canonical skeleton includes `project` and `viewport` | P2-13e omits both (no state exists before 07 D5/D8) and reads them as known-but-unapplied keys; 07 D5 adds them to the writer **without** a revision bump | They are part of v2.0, so adding them is not a new revision; absent means default |
| A6 | `Strategies.curveBeforeFirstPanel` is retired only by a change of the convention (07 §5.11) | P2-13f retires it if the owner keeps the convention (Q10): the legacy convention becomes the only code path. 07 C6's `curvature_convention` key and the `layoutOptions.curveConvention` read are added only if the owner later changes it | A switch with one supported value is dead configuration; C6's file rule (absent means legacy) is unchanged |

The earlier 07 range conflicts are gone: this revision adopts 07's 200 sections, 100,000 mm panel height, 65,536 LEDs, ±180° curve, ±100,000 m positions, the C0/C1/bidi strip set, the snake_case superset, the `"version": "2.<n>"` dispatch, the issue codes, and the recomputed `nextSectionId`.

**One fixture name.** `LegacyProfiles` (§4.2) is the only legacy-profile fixture.
**One re-baseline procedure.** §8.1: the baseline is the parent commit's output, every run is full, every golden-changing commit carries an expected-change manifest, and `expected/_nondeterminism.json` is the only standing allowance. `run.mjs --only` is for local iteration and never produces a promoted baseline.
**One v2 schema.** 07 §4.2. This roadmap's revision-2 camelCase proposal (`schemaVersion`, `schemaRevision`, the `wall` wrapper, a stored `nextSectionId`) is withdrawn.

---

## 6. Algorithms and math

Conventions: metres, Y up, the wall front faces +Z, and the origin is the first section's bottom-left edge vertex (ARCHITECTURE §1.4). Section heading `a`. Edge step `d = (cos a, 0, sin a)·panelW`. Stage-facing panel normal `n = (−sin a, 0, cos a)`, which is `(−dz, 0, dx)/len`.

### 6.1 Chunked base64 (B-H3)

```js
function chunkedBase64(bytes) {              // bytes: Uint8Array
  const CHUNK = 0x8000;                      // 32,768 arguments per apply: below the V8 (~125k) and JSC (~65k) limits
  const parts = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));               // ONE btoa over the whole binary string: no mid-stream '=' padding
}
```

The output is **byte-identical** to the legacy encoder for every buffer the legacy encoder could handle (it is the same binary string), so all existing glTF outputs stay identical. Encoding chunks separately and concatenating the results would be wrong unless the chunk size were a multiple of 3. A single `btoa` avoids that pitfall.

### 6.2 Index width (B-L5)

glTF 2.0 forbids an index equal to the component type's maximum value (65,535 for 5123, 4,294,967,295 for 5125): it is the primitive-restart value, and the Khronos validator reports it as an error. WebGL2 always treats it as restart too. So the threshold is **at or above** 65,535:

```
maxIndex = max over indices (loop, no spread)
indexWidth(maxIndex) = maxIndex >= 65535 ? 'uint32' : 'uint16'
'auto' (glTF): 'uint32' -> Uint32Array, componentType 5125; 'uint16' -> Uint16Array, componentType 5123
viewport (LEDWallView, P2-1e): 'uint32' -> geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1))
                               'uint16' -> geometry.setIndex(indices)          (r128 picks Uint16 below 65,536; unchanged)
```
Pad the index bufferView to 4 bytes as today.
- r128's own `setIndex(array)` test is `arrayMax(index) > 65535`, so a combined mesh with exactly 65,536 vertices (maximum index 65,535) would get a Uint16 attribute containing the restart value and lose a triangle. P2-1e passes the Uint32 attribute explicitly in that case.
- After P2-7d each combined glTF primitive holds one section (at most 51 × 21 = 1,071 vertices under the validated limits), so the glTF case becomes unreachable for validated walls; `'auto'` stays as a guard. The viewport combined mesh still holds all sections (up to 100 × 1,071 vertices), so P2-1e matters there.
- Boundary tests: 65,535 vertices (maximum index 65,534) → Uint16; 65,536 vertices (maximum index 65,535) → Uint32.

### 6.3 Canvas fit (B-L4)

```
canvasFits(w, h) = w >= 1 && h >= 1 && w <= 32767 && h <= 32767 && w * h <= 268435456

exportPanelIds: {w, h} = panelIds.atlasSize(sections, atlas); if (!canvasFits(w, h)) alert M-EXP-2; return
                canvas = panelIds.atlasCanvas(...); canvas.toBlob(blob => blob ? saveBlob(...) : alert M-EXP-3)

exportZIP:
  1. Pre-check (pure arithmetic, before anything is written):
       names = textureFileNames(sections)
       for i: if (!canvasFits(panelIds.sectionSize(sections[i], null))) { skipped.push(names[i]); names[i] = null }
       atlasName = Q5 ? atlasTexturePath(brand.files) : null   ('textures/' + Brand.files.panelIdsPng, every mesh mode; P2-7f, 04 §2.3 (b))
       if (atlasName && !canvasFits(panelIds.atlasSize(sections, atlas))) { skipped.push(atlasName); atlasName = null }
       atlasRef = (combined mode) ? atlasName : null   (the MTL references the atlas only while the UVs are atlas-placed)
  2. Write JSON (texture_file: names[i], null when skipped), OBJ + MTL with textureNames = names and atlasFile = atlasRef
     (the MTL writes no map_Kd for a null entry), glTF.
  3. Render textures: for i with names[i] !== null: dataUrl = canvas.toDataURL('image/png');
       if (dataUrl === 'data:,') { late.push(i) } else folder.file(names[i], …)        (device limit below the hard limit)
     same for the atlas.
  4. If late.length: null those names, then re-write the JSON entry and the MTL entry with the updated names
     (JSZip keeps the entry position on overwrite).
  5. After the download: if (skipped.length + late.length) alert M-EXP-4 with every left-out entry name.
  Before P2-6 the MTL still uses the legacy index naming (B-M2), so P2-1c passes a `skipped: boolean[]` to the
  serializer and the OBJ writer instead of null names; P2-6b/d replace it with the null entries of `textureNames`.

viewport (P2-1d): PanelIdRenderer.atlasCanvas(...) / sectionCanvas(...) / panelCanvas(...) first compute their size
  (panelCanvas: ledX·p × ledY·p with p = panelPxPerLed ≥ 4, so ledX ≥ 8,192 already exceeds 32,767 px);
  if (!canvasFits(w, h)) return null. LEDMaterialFactory: a null canvas -> the colour material for that mesh,
  and one win.console.warn per rebuild:
  `Panel IDs are not shown for "${name}": its ${w}×${h} px texture exceeds this browser's canvas limit.`
  WallController reports the same sections in WALL_REBUILT.textureStatus.undisplayable (P2-13b line 3).
```

`CANVAS_HARD_LIMITS` are Chrome's limits. A device with lower limits (iOS Safari allows about 16.7 MP of area) can still return a blank canvas for the viewport; exports already detect that through `toBlob`/`toDataURL` (M-EXP-3, step 3). 07's `CanvasProbe` (E3) later replaces the hard limits with probed device limits for the viewport guard (§5.6).

### 6.4 Winding and normals (B-H1, B-H2, B-L3)

```
quadIndices(bl, br, tl, tr, 'ccw') = [bl, br, tr,  bl, tr, tl]
panelQuadIndices(base) with corners BL=0, BR=1, TR=2, TL=3 -> [base, base+1, base+2, base, base+2, base+3]
```

**Proof that this faces +Z**, for a flat quad with BL (0,0,0), BR (w,0,0) and TR (w,h,0): `(BR−BL) × (TR−BL) = (w,0,0) × (w,h,0) = (0, 0, w·h)`, which is +Z. The legacy `[bl, tl, tr]` gives `(0,h,0) × (w,h,0) = (0, 0, −w·h)`, which is −Z (B-H1).

**Same triangles, same diagonal.** Both orders split the quad along `bl–tr`. Per quad, new triangle 0 `(bl, br, tr)` is legacy triangle 1 `(bl, tr, br)` with its last two vertices swapped, and new triangle 1 `(bl, tr, tl)` is legacy triangle 0 `(bl, tl, tr)` swapped the same way. Rasterised coverage and interpolation of filled triangles are therefore identical, and with unlit `MeshBasicMaterial` + `DoubleSide`, **filled viewport pixels cannot change**.

**Wireframe exception.** With `material.wireframe`, r128 builds line pairs from each triangle in index order (`a,b`, `b,c`, `c,a`). The edge set per quad is the same, but four of the six edges are now drawn in the opposite direction, and line rasterisation is not guaranteed to be direction-invariant (diamond-exit rule). So `toggles/01_wireframe.screenshot.png` may WARN. P2-2a declares it under `mayChange` with this reason; every other screenshot must be identical.

**Panel facing normal.**
- With `rotY = −atan2(dz, dx)`: `(sin rotY, 0, cos rotY) = (−dz, 0, dx)/len`.
- The CCW panel face normal `(BR−BL) × (TR−BL) ∝ (sin rotY, 0, cos rotY)` (verified from `panelCorners`).
- So `mesh.obj.panelNormal = 'facing'` stays as it is.

**`'averaged'` vertex normals** (with 01 CR-1). The normals are per section, with no averaging across section junctions, so `angleOffset` corners stay crisp:

```
for each section sl with edges e[0..C] (C = sl.edges.length - 1):
  n[j]: dx = e[j+1].x - e[j].x; dz = e[j+1].z - e[j].z; len = Math.sqrt(dx * dx + dz * dz);
        n[j] = (-dz / len, 0, dx / len)                             for j = 0..C-1   (verbatim legacy 1610-1615, stage-facing)
  if (sl.isFlat)                                                    // sl.isFlat = (section.curveIntensity === 0)
      normals = the 'right-panel' normals of sl, verbatim:          // bit-identical by construction; nothing is renormalised
                column k < C -> n[k];  column C -> n[C-1]
  else                                                              // curved
      column k: k == 0 -> n[0]; k == C -> n[C-1]; else normalize(n[k-1] + n[k])
  (every row of column k uses the same normal; y component 0)
```
**Why the test is per section, not per vertex.** Edge positions are accumulated (`x += panelW·cos a`), so on a flat section at a non-axis heading neighbouring `n[j]` can differ in the last bit. A per-vertex `Object.is` short-circuit therefore misses some vertices (on `large_wall`, section L3 at 40°, 4 of the 78 interior flat-section vertices) and renormalises them into a value that is not bit-equal to `'right-panel'`. The section-level test makes flat output equal to `'right-panel'` everywhere, and within 1e-12 of the analytic `(−sin a, 0, cos a)`. For curved sections, the interior normals are the bisectors. The normals are never negated: the safe zone, coverage and camera code depend on +Z being the front.

**OBJ after P2-2c:**
- header: one constant line after `# Mesh Mode: …` (01 CR-3): `# Faces: counter-clockwise front faces; vn point out of the LED surface (toward the stage)`;
- combined/section: `v…` lines, `vt…` lines, then one `vn nx ny nz` per vertex (`toFixed(6)`), then faces `f a/a/a b/b/b c/c/c`;
- panel: unchanged except the face order `v/t/n v+1/t+1/n v+2/t+2/n` and `v v+2 v+3`.

**glTF after P2-2d:**
- `NORMAL` accessor: `componentType 5126`, `type "VEC3"`, its own bufferView with target 34962, no min/max;
- panel meshes: 4 copies of the facing normal.

### 6.5 Escaping and validation (B-M4, B-L8)

```js
const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ESC[c]);
```
- **Every interpolation is escaped:** text nodes and double-quoted attributes (`value="…"`, `data-id="…"`, `style="background: …"`). The colour is validated to `#rrggbb` before it reaches `style`, which is defence in depth against CSS injection; escaping alone would not stop `red;background:…`.
- **Titles.** `setTitleWithWarning(titleEl, name, warn)` sets `titleEl.textContent = name`, then, if `warn`, appends the text node `' '` and a `<span class="warning-indicator">⚠</span>`, both created with `titleEl.ownerDocument.createElement`/`createTextNode` (no global `document`). This replaces the B-L16 regex. The resulting `textContent` (`"Stage Left ⚠"`) matches what render() produces.
- **Id assignment** follows 07 §6.8 exactly, after the v1 migration has filled missing ids with the array index (`s.id !== undefined ? s.id : i`, legacy V-3):
  ```
  MAX_ID = 2147483647                           // 2³¹ − 1
  used = {}; for (s of sections): if (Number.isInteger(s.id) && 0 <= s.id <= MAX_ID && !used.has(s.id)) used.add(s.id)
  next = used.size ? max(used) + 1 : 0
  for (s of sections, in order): if (s is not the first occurrence of a valid id) { from = s.id; s.id = nextFree(); used.add(s.id); issue reassigned-id }
  nextFree(): while (next <= MAX_ID && used.has(next)) next++
              if (next <= MAX_ID) return next++
              return the smallest n >= 0 with !used.has(n)   // fallback at the top of the range, so re-validation never renumbers again
  Wall.nextSectionId = nextFree()               // recomputed on every import; never stored (07 §6.8)
  ```
  The first occurrence of each id keeps it, so logos and selections keyed by it stay attached. Harness checks: `concave_offsets` keeps ids 3, 7, 2 (the missing one takes its index 2) with no issue; `import_edge` (iv) `[1, 1, 2, missing]` gives `[1, 4, 2, 3]` with one `reassigned-id`; (v) `'abc'` gives `0` with one `reassigned-id`.

### 6.6 Unique texture names (B-L14, B-M2)

```js
export function textureFileNames(sections) {
  const used = new Set(); const out = [];
  sections.forEach((s, i) => {
    const base = sanitizeFilename(s.name || `Wall_${i + 1}`);
    let candidate = base, k = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${base}_${k++}`;   // case-insensitive: Windows/macOS unzip
    used.add(candidate.toLowerCase());
    out.push(`${candidate}_PanelIDs.png`);
  });
  return out;
}
```
Names without collisions are unchanged (`Back_PanelIDs.png`, …), so existing ZIP texture entries stay identical. Callers that skip a texture replace its entry with `null` (§6.3); the helper itself never returns `null`.

### 6.7 Pixel-accurate atlas UVs and the glTF V flip (B-M5, B-M6, B-M7)

This section is authoritative for P2-7 (§5.6). It implements the decisions 04 §2.3 binds for both specs; 04 §6.2 and §7.3 describe the same rules from Feature 4's side.

The atlas is `totalLedX × totalLedY` LEDs. Section `i` occupies LED columns `[ledOffsetX, ledOffsetX + cols·ledX)` and is **bottom-aligned**: it is drawn at canvas `y = (totalLedY − rows·ledY)·scale`, and `CanvasTexture.flipY` puts canvas-bottom at v = 0.

```
u = uvOffsetX_i + (col / cols) * uvWidth_i              (unchanged)
v = (row / rows) * uvHeight_i,  uvHeight_i = (rows·ledY) / totalLedY     ('atlas-pixel-accurate')
```
- **Equal heights:** for every section, `uvHeight = 1` exactly, and `(row/rows) * 1` reproduces the legacy `row/rows` bit for bit. So only walls with mixed pixel heights change (in the harness, only `mixed`).
- **Single sections** keep the legacy combined OBJ `vt`, because `0 + x*1 === x`.
- **LED-sim repeat** (`totalLedX, totalLedY`) becomes correct automatically: a section with `rows·ledY` LED rows now spans `v ∈ [0, uvHeight]`.

**glTF `TEXCOORD_0`.** glTF puts the UV origin at the **top-left** of the image, and three's GLTFLoader sets `texture.flipY = false`. The exporter therefore writes `(u, 1 − v)`; the builder keeps the OBJ/three convention. The accessor is `5126`, `"VEC2"`.

UVs by mode:

| Mode | UVs |
|---|---|
| combined | atlas UVs as above |
| section | `(col/cols, row/rows)` |
| panel | exports: `PANEL_UVS` (BL 0,0; BR 1,0; TR 1,1; TL 0,1), the same as the OBJ `vt 0 0 / 1 0 / 1 1 / 0 1`, until 04 UV-9 makes section-space UVs the export default. Viewport: panel IDs use section-space UVs from P2-12d (§6.15); LED sim and colour keep per-panel UVs |

### 6.8 Per-section materials in combined exports (B-L6)

This section is authoritative for P2-7d and P2-7f (§5.6); it implements 04 §2.3's decisions (a) and (b), and 04 §7.1/§7.3 build on it.

- **OBJ:**
  - MTL: one `newmtl Wall_<i+1>` per section, with `Kd` from the section colour (`toFixed(4)`), then `Ka`/`Ks`/`Ns`/`d` as in section mode. The legacy single `newmtl LED_Wall_Combined` is removed, including for single-section walls (04 Q11).
  - OBJ: keep `o LED_Wall_Combined`, all `v`, then all `vt`, then all `vn`. Then, per section, `usemtl Wall_<i+1>` followed by that section's faces.
  - ZIP with Q5 = yes (P2-7f): the ZIP always contains `textures/panel-ids.png` (the atlas canvas, the same image as `panel-ids.png`) when `canvasFits` passes, in every mesh mode. In combined mode each `newmtl Wall_<i+1>` gains `map_Kd textures/panel-ids.png`, unless the atlas was skipped (§6.3). In section and panel mode the MTL does not reference it (the UVs are not atlas-placed); it ships for downstream tools and for 04's later `atlas` layout.
- **glTF:** mesh `LED_Wall_Combined` (one node) with `primitives[i] = {attributes: {POSITION, NORMAL, TEXCOORD_0}, indices, material: <Wall_<i+1>_Material>}`. Each primitive has **its own** accessors for its section's vertex range, with indices starting at 0 (04 §7.3). The material `LED_Wall_Combined_Material` is removed.
  - The vertex data is the same as before (legacy combined meshes never shared vertices across sections), so only bufferView boundaries and 4-byte padding change.
- **Empty walls** cannot occur after P2-3, so the B-L8 `TypeError` is gone.

### 6.9 Mitred, clamped safe-distance band (B-M15, B-L29)

Inputs: the run polyline `p[0..N]` (in Phase 2 the single run of `layout.flatEdges()`: every panel edge of every section, in order; from Feature 2 one call per `floorRuns()` run, 02 §6.12; `p[k]` at y = 0), the membership of each vertex in its section(s) (a junction vertex belongs to both), and the distance `D` (§6.10). `EPS = 0.001` m. Feature 1 (01 §6.4) multiplies each segment's offset normal `m[j]` by its facing σ (from Feature 2 on, the run's `facing`); in Phase 2 every σ is +1.

```
segments j = 0..N-1:  t[j] = normalize(p[j+1] − p[j]) (in xz);  L[j] = |p[j+1] − p[j]|;  m[j] = (−t[j].z, 0, t[j].x)   // stage normal
turn at interior vertex k = 1..N-1:
    θ[k] = atan2(t[k-1].x·t[k].z − t[k-1].z·t[k].x,  t[k-1]·t[k])        // signed; θ > 0 = concave (turns toward the stage)
    split[k] = (1 + m[k-1]·m[k] < 0.03)                                    // fold-back, |θ| ≳ 166°: no mitre
    θ[0] = θ[N] = 0 (polyline ends); a split vertex counts as two polyline ends
shortening at vertex k:  τ[k] = split[k] ? 0 : max(0, tan(θ[k] / 2))      // how far a concave mitre pulls the offset edge in
segment limit:           lim[j] = (τ[j] + τ[j+1] > 0) ? max(0, L[j] − EPS) / (τ[j] + τ[j+1]) : +∞
concave curve limit:     for a section s with curveIntensity c_s > 0:  r_s = panelW_s / (2·tan(c_s / 2))   // inradius
distance at vertex k:    d[k] = min(D, lim[k-1] (k ≥ 1), lim[k] (k ≤ N-1), min over concave sections s containing k of (r_s − EPS))
safe vertex at k:        k == 0: w[0] + d[0]·m[0];   k == N: w[N] + d[N]·m[N-1]
                         split k: two vertices, w[k] + d[k]·m[k-1] (ends segment k-1) and w[k] + d[k]·m[k] (starts segment k)
                         else:    w[k] + d[k]·(m[k-1] + m[k]) / (1 + m[k-1]·m[k])        // mitre: offset·m[k-1] = offset·m[k] = d[k]
strip:                   wall vertex w[k] = (p[k].x, lift, p[k].z), colour 'wall'; safe vertices at y = lift,
                         colour 'threshold' when d[k] === D, else 'clamped' (counted in clampedVertices)
triangles, per segment j with start safe vertex S_j and end safe vertex E_j:
                         (w[j], E_j, w[j+1]), (w[j], S_j, E_j)            -> face normal +Y (B-L29)
                         a triangle whose doubled area |cross| < 1e-12 m² is dropped
outline:                 the safe vertices in order at y = lineLift (the true band edge); label at the middle safe vertex
```

**Why it never flips.** The offset vertex at `k` moves along segment `j`'s tangent by `±d[k]·tan(θ[k]/2)`: forward (shortening the offset edge) for a concave turn, backward for a convex one. The offset edge of segment `j` keeps its direction while `d[j]·τ[j] + d[j+1]·τ[j+1] ≤ L[j]`. Since each `d` is at most `L[j] / (τ[j] + τ[j+1])`, the sum is at most `L[j]`, so no strip quad becomes a bow-tie. A regular concave arc (equal panels, turn `c`) gives `lim = (panelW − EPS) / (2·tan(c/2))`, the **inradius** minus a small margin. Interior vertices then stop just short of the centre of curvature instead of overshooting it (a mitre of length `d / cos(c/2)` with `d` equal to the circumradius would land past the centre). The explicit `r_s − EPS` term also clamps the section's **end and junction vertices**, so no safe vertex of a concave section lies outside its circumcircle.

**Worked cases** (default lens, D from §6.10):

| Wall | D | Result |
|---|---|---|
| `flat3`, `convex`, `large_wall` | 2.19, 2.92, 14.58 m | no vertex clamped; flat walls give exactly the legacy quad positions (deduplicated) |
| `concave_offsets` (5°, 3.5°, 7.5° curves; inradii 5.7, 8.2, 3.8 m, so no inradius clamp) | 2.92 m | the A→B junction is an 18.5° concave turn (the 15° offset plus the first 3.5° step). Three vertices are clamped: the one before the junction (2.415 m), the junction itself (2.415 m) and the one after it (2.58 m); everywhere else d = D. A pure mitre would fold the last panel of A over (shortening 2.92 × 0.207 = 0.60 m > 0.5 m) |
| `mixed` (in no safe-distance scenario) | 2.46 m | the Wide→Small junction (a 30° concave turn next to 0.25 m panels) and its neighbour are clamped to 0.929 m |
| `concave30` (new: 6 × 500 mm at 30°, inradius 0.933 m) | 2.92 m (arc width), 1.88 m (chord width, after P2-11c) | interior vertices clamped to 0.931 m, ends to 0.932 m; every triangle +Y |
| `box_corner` (3 m × 2 m U, two concave 90° corners) | 2.19 m | the corner vertices and their panel neighbours are clamped to 0.499 m (a 0.5 m panel next to a 90° concave turn); every triangle +Y |

These values were checked with a reference implementation of the pseudo-code above, which also found no −Y triangle in 20,000 random walls (1–4 sections, curves up to ±60°, offsets up to ±180°, D up to 15 m).

**What the clamp costs, and how it is shown.** The clamp guarantees a valid, +Y band, but it makes the band **narrower than D** near concave features: at `box_corner`'s corners the band is 0.499 m deep against D = 2.19 m. In a previs view that would understate the safe floor. Phase 2 therefore makes the narrowing visible instead of silent:
- safe vertices with `d[k] < D` use the `'clamped'` colour (`theme.scene.safeDistanceClamped`, amber), so the outer edge is red where it is at D and amber where it is not;
- the exported OBJ carries `# Clamped: n of N offset vertices are closer than D = … m (concave features)` in its header when `n > 0`;
- walls without concave turns (straight runs and convex curves, such as `flat3`, `convex` and `large_wall`) never clamp, so `camera/13_safe_distance` and their exports carry no tint and no header line.

**Out of scope (documented, Q18).** The clamp is local: it prevents flipped triangles between adjacent segments. It does not detect **overlaps between non-adjacent segments**. On U-shaped stages where `D` exceeds the opening (in `box_corner`, the Back and Front bands overlap because D = 2.19 m > the 2 m opening), the strips of opposite walls overlap. They are drawn at the same height with transparency, so the overlap shows as a darker region; the exported OBJ contains overlapping faces.

**The proper fix for both limits is one follow-up (Q18): a trimmed offset polyline.** Offset every segment by `D`, drop the segments whose offset collapses (their two mitre points cross), intersect the remaining neighbouring offset lines, and finally clip the offset polygon against itself so that regions closer than `D` to another part of the wall are removed. This gives a band whose outer edge is everywhere exactly `D` from the nearest wall point: no narrowing at concave corners and no overlap on U-shaped stages. It is about 2–3 days of computational-geometry work with its own fuzz tests, so it is not part of Phase 2.

**+Y check.** With w0 = (0,0,0), w1 = (1,0,0) and s1 = (1,0,1): `(s1−w0) × (w1−w0) = (1,0,1) × (1,0,0) = (0, 1, 0)`. For flat walls (all `m[j]` equal), the positions equal the legacy quads, so `camera/13_safe_distance` is expected to be identical up to a WARN.

### 6.10 Coverage, framing and frustum depth (B-M10, B-L2, B-L33)

**World-space wall (all three use it).** The analyser and the framing never read raw cursor-walk edges. They read the layout stage that the exporters use:
- `layout = layoutProject(project)`. In Phase 2 every `postTransform` is null and there is no root transform.
- `layout.worldVertices()`: every grid corner (`row ≤ panelRows`, `col ≤ panelCols`, `y = row·panelH`) in the layout's frame, after the section's Feature 2 `postTransform`. Feature 3 puts the stage layout in the stage frame by translating the walk inside `layoutProject` (`translated(t)`, then `applySectionOffsets`); there is never a wall root transform (07 C32).
- `layout.columnQuads()`: per section column `k`, `p0 = T(e[k].x, 0, e[k].z)`, `a = T_vec(e[k+1] − e[k])`, `b = T_vec(0, rows·panelH, 0)`, `n = normalize(a × b)`. `T` is the same composed transform. Both features use rigid transforms, so `a ⊥ b` is preserved.

So Features 2 and 3 only need to make these two methods apply their transforms; coverage, framing and the safe distance follow automatically (§5.2).

**Cost per pose.** The analyser runs on every gizmo `mousemove` and every pilot frame. Both arrays are memoised on the layout instance, which is rebuilt only on `WALL_REBUILT`, so a pose change allocates nothing layout-sized. The per-pose work is 5 rays and one projected quad per **column** (at most 200 × 50 = 10,000 columns), never the full vertex grid; `worldVertices()` (up to about 214,000 points at the 07 limits) is read only by framing, once per rebuild.

**Camera basis** (YXZ, matching `CameraRigView.updateTransform`): `R = Ry(pan)·Rx(tilt)·Rz(roll)`; `f = R·(0,0,−1)`, `r = R·(1,0,0)`, `u = R·(0,1,0)`; `tx = tan(hFov/2)`, `ty = tan(vFov/2)`.

**Rays.**
- Origin `o = (posX, posY, posZ)`.
- Centre ray `f`.
- Corner rays `normalize(f + sx·tx·r + sy·ty·u)` for `sx, sy ∈ {−1, +1}`.

**Ray–quad intersection.**
```
den = d·n; if (den >= -1e-9) skip            // only front-facing hits count (camera behind the wall -> miss)
t = ((p0 − o)·n) / den; if (t <= 0) skip
q = o + t·d − p0; s = (q·a)/(a·a); v = (q·b)/(b·b); hit iff 0 <= s <= 1 && 0 <= v <= 1; keep the smallest t
```

**Frame distance `D0`.** This is the distance at which the frame size is measured:
1. Take the centre ray's `t` against the nearest front-facing column **plane** whose hit lies inside that column's horizontal extent (`0 ≤ s ≤ 1`, any height).
2. If there is none, take the nearest positive front-facing plane `t` over all columns.
3. If there is still none, `D0 = null`.

For a flat wall, every column shares the plane z = 0, so `D0 = posZ` for any unrotated camera, exactly as in legacy.

**Wall size measures (rotation-invariant).**
- `facing = normalize(−(last.z − first.z), 0, last.x − first.x)`, the chord normal from the world-space `firstEdge` to `lastEdge` (`(0, 0, 1)` when the chord is degenerate, for example a closed ring).
- `chord = (facing.z, 0, −facing.x)`, the horizontal axis perpendicular to `facing`.
- `width = layout.extentAcross(facing) = max(v·chord) − min(v·chord)` over `worldVertices()`: the wall's extent as seen face-on.
- `height = max.y − min.y` over `worldVertices()`.

This replaces the axis-aligned `max.x − min.x`, which was 0 for a wall along Z and lost about 30% at 45°. For flat walls along +X, `width` equals the legacy `Σ cols·panelW` (for `flat3`, 7 m from both; the `default` and `flat3` cases are unit-tested with `Object.is`, and any 1-ulp drift on other flat walls is invisible at the readouts' `toFixed(2)`). **The same `width` and `height` feed the status (`fits`) and the safe distance `D`**, so they always agree.

**Status.** Let `W = 2·tx·D0` and `H = 2·ty·D0`, and let `fits = W <= width && H <= height`. The frame **touches** the wall when either of these holds:
- any of the 5 rays hits a true quad;
- any column quad overlaps the frame in image space. For each quad (corners `p0`, `p0+a`, `p0+a+b`, `p0+b`): transform the corners to camera space (`x = v·r`, `y = v·u`, `z = v·f` for `v = corner − o`), clip the polygon against the near plane `z ≥ 1e-6`, project the remaining vertices to `(x/z, y/z)`, and run a separating-axis test of that convex polygon against the rectangle `[−tx, tx] × [−ty, ty]`. This also catches a frame that crosses a column without containing any of its corners (for example a wide, short frame across a tall column), which a "does any vertex project inside" test would miss.

| Status | Condition | Readouts |
|---|---|---|
| `offWall` | `D0 === null` or the frame does not touch the wall | frame W/H shown when `D0` is non-null, else `—` |
| `within` | all 4 corner rays hit | – |
| `offCenter` | `fits && !within` | – |
| `exceeds` | otherwise | – |

**Bit-compatibility.**
- For an unrotated camera in front of a flat wall at z = 0 (`flat3`), `D0 = posZ`, and `W`/`H` equal the legacy values.
- Corner hits ⇔ legacy `frameLeft ≥ 0 && frameRight ≤ W && frameBottom ≥ 0 && frameTop ≤ H`.
- The status differs only when the frame is entirely off the wall. No unrotated state in the harness is like that: `cam_07_position` still touches through its bottom corners and stays `exceeds`. So every unrotated recorded state is expected to be unchanged: `camera` `cam_00…cam_07`, `cam_09b`, `cam_09c`, `cam_11…cam_15`; `gizmo_drag/camera_01_translated`; `pilot_look/look_00_pilot_on`; every `preview_off_in_pilot` state; `import_edge/i_empty_state`.
- **Only the states recorded with a rotated camera change**, in every scenario that records coverage readouts (found by grepping the baseline for `frustum-status-text` and a non-zero `camera-rot-*`):
  - `camera`: `cam_08_rotation` and `cam_09_far` (rot 5°, −10°, 2°), and `cam_10_clamps` (tilt 90°: the camera looks straight up, so `D0 = null` and the status is `offWall` with `—`);
  - `gizmo_drag/camera_02_rotated` (pan −44°);
  - `pilot_look/look_01_after_drag` and `look_03_pilot_off` (tilt −10.8°, pan −36°: the centre ray now meets the wall plane at about 6.3 m instead of `posZ` = 5 m).

**Framing (`framingBounds: 'layout'`).** `framingBounds(project)` returns `{min, max, center, width, height, facing}`. P2-11c implements **`FramingPolicy`'s three named boxes** (07 C34), and each consumer names the one it reads:
- **`generativeBox`** (`layout.generativeBounds()`: the attached sections, pre-offset; attached-only from 02 T3 on, identical until a section is detached): the automatic orbit re-target on every rebuild before 07 I4b, and spec 03's `mesh-center` anchor;
- **`wallBox`** (`layout.bounds()`: transformed, every section including detached ones): `center` for `resetTo`, and 07's `F`, Reset, open, new and restore framing from I4b on;
- **`stageExtent`** (`worldVertices()` of the sections whose LED normal has |n.y| ≤ 0.9, so overhead sections do not inflate it; 09 Q16): `width`, `height`, the safe distance `D` and `fits`.
Coverage rays keep every `columnQuad`. On every harness wall (no offsets, no detached or horizontal sections) the three boxes coincide with the box of `worldVertices()`, so the results below are identical; `min`/`max` are that box, `center = (min + max)/2`, and `width`, `height`, `facing` as above.

Consumers:
- the orbit target is `center + offset` (`generativeBox`);
- **`resetTo(framing)`** puts the camera at `center + 5·facing` (`wallBox`), with `rotY = wrapDeg(atan2(facing.x, facing.z)·180/π)`, `rotX = rotZ = 0`. `wrapDeg` maps the result into (−180, 180], the convention used everywhere else, and returns `+0` for `±0`. Its forward vector `(−sin pan, 0, −cos pan)` then equals `−facing`, so the camera looks at the wall. For a flat wall this is `(W/2, H/2, 5)` with `rotY = +0`, identical to legacy (`Object.is`). For a single section with a 180° offset, `facing.x = −1.22e−16`, `atan2` gives exactly −180° and `wrapDeg` gives **180**; `posZ` is negative there, which is valid because P2-11c removes the Z minimum (Q13);
- the safe distance `D = min(width / (2·tx), height / (2·ty))` (`stageExtent`). All harness walls are height-limited (`concave_offsets` and `convex`: `D = 2 / (2·12/35) ≈ 2.92 m` under both measures), so their `D` does not change; the new `concave30` wall is width-limited after P2-11c (2.92 → 1.88 m).

**Camera Z rule (Q13, P2-11c).** `CineCamera.FIELD_RULES.posZ` becomes `finiteOr(v, 5)` with no minimum, matching the gizmo and pilot writes (§4.4). The input loses `min="0.1"` and is relabelled "Z Position (m)". A camera at or behind the wall is handled by the analyser (`offWall`).

**Frustum depth (one unit: camera-space depth).** The legacy rig, which `rebuildFrustum` keeps, builds each far corner in camera space at `(sx·tx·z, sy·ty·z, −z)`, where `z` is a **depth along the forward axis**, not a distance along the corner ray. The analyser's ray parameter `t` is a Euclidean distance along the normalised ray `d`, so it is converted:

```
corner c (TL: sx −1, sy +1; TR: +1, +1; BR: +1, −1; BL: −1, −1), ray d_c = normalize(f + sx·tx·r + sy·ty·u)
z_c = t_c · (d_c · f) = t_c / sqrt(1 + tx² + ty²)        if the corner ray hits a quad
    = D0                                                  else if D0 !== null   (D0 is a centre-ray t, i.e. already a depth along f)
    = MAX_FRUSTUM_DEPTH_M = 15                            else                  (the legacy depth)
cornerDepths = [z_TL, z_TR, z_BR, z_BL]
```

With `z_c` from a hit, the far corner `(sx·tx·z_c, sy·ty·z_c, −z_c)` in camera space is exactly the hit point `o + t_c·d_c`. Feeding `t_c` in directly would overshoot by `sqrt(1 + tx² + ty²)` (1.176 for Full Frame at 35 mm, about 18 % through the wall). With no hits at all, every depth is 15 and the rig equals legacy.

**What `updateFrustumDepths` rewrites.** Each far corner occurs 12 times across the two geometries of the legacy construction (2384-2427): in the `LineSegments` (the far rectangle's 8 endpoints and the 4 connecting lines' far ends) and in the semi-transparent fill mesh `frustumOutline` (its four side faces). `rebuildFrustum` records every vertex index where it writes each far corner while building (`#farSlots = {lines: {TL, TR, BR, BL}, fill: {…}}`), so the lists are derived, not hard-coded. For the legacy order they are: lines TL 8, 15, 17; TR 9, 10, 19; BR 11, 12, 23; BL 13, 14, 21; fill TL 11, 19; TR 13, 20, 22; BR 14, 16, 26, 28; BL 8, 10, 29. `updateFrustumDepths(cornerDepths)` rewrites all 24 slots with `setXYZ`, sets `needsUpdate` on both position attributes and calls `computeBoundingSphere()` on both geometries. The near corners never change. The depths depend on the pose, so every pose change updates them (P2-12c, in place).

### 6.11 Select on click and the shortcut filter (B-M14, B-L11)

```
mousedown(e): if pilot -> pilot.onMouseDown(e); return
              handled = gizmo.onMouseDown(e)
              pending = (!handled && e.button === 0) ? {x: e.clientX, y: e.clientY} : null
mouseup(e):   if pilot -> pilot.onMouseUp(); return
              wasDrag = interaction.isDraggingGizmo; gizmo.onMouseUp()
              if (pending && !wasDrag && e.button === 0 && gizmo.mode &&
                  (e.clientX - pending.x)**2 + (e.clientY - pending.y)**2 < CLICK_TRAVEL_PX**2) selection.pickAt(e)
              pending = null
keydown(e):   if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return; …legacy routing
              // isTypingTarget: core/typingTarget.js (P2-9b), 07 §3.8's truth table; 07 I1 replaces this routing with KEYMAP
```
The orbit listener (registered first) is unchanged, so a press-and-drag orbits and keeps the selection.

### 6.12 Gizmo rotation (B-M12, B-L28)

- `angle = atan2((startDir × currentDir)·n, startDir·currentDir)` is positive for a counter-clockwise drag about the ring axis, so it is **added** (sign +1).
- For the camera, the write is a quaternion composition:
  ```
  q  = quatFromEulerYXZDeg(rotX, rotY, rotZ); qa = quatFromAxisAngleDeg(axis, delta)
  q' = space === 'world' ? qa·q : q·qa
  (rotX, rotY, rotZ) = eulerYXZDegFromQuat(q')       // x = asin(-clamp(m23)) ∈ [-90, 90]; y, z = atan2 ∈ (-180, 180]
  ```
  This is the same decomposition three.js r128 uses in `Euler.setFromRotationMatrix(m, 'YXZ')`, so the ranges match the field rules without clamping.
- With `rotX = rotZ = 0`, a world-Y rotation composes to `(0, rotY + delta, 0)` (wrapped), so the existing `gizmo_drag` scenario (Y ring only) cannot see the difference; P2-9f is proved by unit tests (§8.4).
- Props rotate about Y only, so `rotY = wrapDeg(rotY + delta)` (world and local are the same).

### 6.13 Movement (B-M13, B-L27)

- **Pilot forward:** `(−sin pan·cos tilt, +sin tilt, −cos pan·cos tilt)`. This follows from `Ry(pan)·Rx(tilt)·(0,0,−1)`, where `Rx(θ)·(0,0,−1) = (0, sin θ, −cos θ)`. It is the same direction `enterView` uses.
- **Frame-rate independence:** `startLoop` computes `dt = clamp((now − last)/1000, 0, 0.1)`, where `now` is the rAF timestamp, and passes it to `tick(dt)`. The range is **[0, 0.1]**; the first synchronous frame uses `dt = 0`.
  - Orbit step: `MOVE_SPEED * 60 * dt`.
  - Pilot step: `moveSpeed * 60 * dt`.

  At 60 Hz the per-frame steps equal the legacy ones. No harness scenario holds a movement key, so no golden output depends on the frame rate.

### 6.14 Preview (B-M9, B-M11, B-L32)

**Helper hiding (B-M11).** In `render(scene, helpers)`:
```
saved = []
for (const h of helpers) { saved.push(h.visible); h.visible = false; }
renderer.render(scene, camera)
restore every visible flag in order
```
This needs no layer assignment, so raycasting of gizmo handles and the camera body (which are helpers) is unaffected.

The `LAYERS.HELPERS` seam remains for 07 R1 / 05 T0's single-renderer pass. In r128, `Raycaster.layers` and per-object `layers.test` are enforced on every descendant (`WebGLRenderer.projectObject` and `Raycaster.intersectObject` test each object's own layers). The layer route would therefore require tagging all descendants and enabling HELPERS on both the main camera and the pointer raycaster; that is 07 R1's job.

**Window size and letterbox (B-M9 + B-L32), 07 §3.6/§6.1 semantics in the existing second renderer.** Pure helpers in `geometry/PreviewFit.js`:
```
clampPreviewSize(w, h) = { w: clamp(w, 200, 800), h: clamp(h, 120, 600) }        // outer CSS px, each axis on its own
letterboxRect(boxW, boxH, A) = (boxW / boxH > A) ? { vw: boxH·A, vh: boxH } : { vw: boxW, vh: boxW / A }
                               with vx = (boxW − vw)/2, vy = (boxH − vh)/2
```
`PreviewWindow`:
```
resize drag (the handle is top-left and the window is anchored bottom-right, so the drag delta is startX − clientX):
   newW = clamp(startW + (startX − e.clientX), 200, 800)       // legacy 3668 + 3673, kept verbatim
   newH = newW / A                                              // A = filmback aspect, legacy 3672-3674
   {w, h} = clampPreviewSize(newW, newH)                        // replaces legacy 3677-3683
   (legacy then re-derived the width from the clamped height without re-clamping it: 100×1 mm gave 12,000 px — B-L32.
    Now only the out-of-range axis is clamped, so a drag at Full Frame still gives 800×533, as legacy, and the
    100×10 drag of `preview_resize` gives 520×120 instead of 1200×120)
windowEl.style.width = w px; windowEl.style.height = h px            (border-box, 2 px border)
inner = { w: w − 4, h: h − 4 }; renderer.setSize(inner.w, inner.h)   (canvas == inner box: no 4 px clipping)
each render: {vx, vy, vw, vh} = letterboxRect(inner.w, inner.h, cine.aspect())
   renderer.setScissorTest(true)
   setViewport/setScissor(0, 0, inner.w, inner.h); setClearColor(0x000000, 1); clear()          // bars
   setViewport/setScissor(vx, vy, vw, vh); camera.aspect = A; updateProjectionMatrix(); render  // image
   renderer.setScissorTest(false)
footer #camera-preview-res = `${Math.round(vw·dpr)}×${Math.round(vh·dpr)} px`, dpr = renderer.getPixelRatio()
```
The window keeps its legacy default size (320 × 180) and is not refitted when the filmback changes; the image is letterboxed instead (07 §3.6). The legacy default Full Frame preview therefore shows bars left and right instead of an 18% stretch.

### 6.15 Panel mode samples the section canvas (B-M16, B-L19)

**Ownership (§5.6).** P2-12d owns the viewport panel-ID path of panel mode and the panel-canvas budget. 04 UV-9 owns the panel-mode **export** UVs and the `uv.panel_uvs` setting. The split follows 04's own statement that the LED sim keeps per-panel UVs.

**Panel IDs in panel mode (P2-12d).**
- Each section gets one panel-ID material, `materials.sectionShared(section, i, startCol)` (04 §6.12), backed by `sectionCanvas(section, i, null, startCol)` and shared by all of the section's panels.
- Each panel's `PlaneGeometry` uv attribute is rewritten **only when the content is panel IDs**: `u' = (col + u)/cols`, `v' = (row + v)/rows`. The builder's `panelUvs` order (BL, BR, TR, TL) maps to the `PlaneGeometry` order TL, TR, BL, BR as indices `[3, 2, 0, 1]` (04 §6.12). Toggling panel IDs already triggers a rebuild (ARCHITECTURE §6.2), so the geometry always matches the content.
- LED sim and colour in panel mode are **unchanged**: per-panel 0..1 UVs, per-panel LED tiles, as in legacy. `toggles/06_ledsim_panel` therefore stays identical.
- Effects:
  - the logo and the section-label size now appear in panel mode (B-L19);
  - panel-ID texture memory falls from up to 2816² px **per panel** to at most 4096² px **per section** (B-M16).

**Budget for the remaining per-panel path (P2-12d).** `panelCanvas` and `panelPxPerLed` are kept for 04's later `uv.panel_uvs = 'panel'` option. So that the option never brings the memory problem back, `panelPxPerLed` now applies 07 §6.12's **wall-wide** budget, `PANEL_TEXTURE_BUDGET_PX` of `geometry/TextureBudget.js` (created here, 07 C38): `totalPanelLeds` is `wallPanelLeds` summed over the sections, and one `pxPerLed` serves the whole rebuild. Only 04's `panel` option reaches it. (Section canvases have their own `SECTION_TEXTURE_BUDGET_PX = 16,777,216` per rebuild, 04 UV-7.)
```
panelModePxPerLed({totalPanelLeds, ledX, ledY}, {budgetPixels = PANEL_TEXTURE_BUDGET_PX /* 33,554,432 */, maxSide = min(maxTextureSize, 4096)}):
  p = min(floor(sqrt(budgetPixels / totalPanelLeds)), floor(maxSide / max(ledX, ledY)), 16);  return max(p, 1)
```
(the default wall keeps 16 px per LED, exactly as legacy). The default path no longer reaches either function, so no harness output changes because of the budget; unit tests cover it. The B-M16 id leaves both tags. `panelCanvas` keeps its B-L19 tag with the text "reachable only with `uv.panel_uvs = 'panel'`" (04 §5.5), and the P2-1d `canvasFits` guard.

**Exports** keep their per-panel 0..1 UVs (`PANEL_UVS`) until 04 UV-9.

### 6.16 Logos: guards, validation and sanitising (B-L35; v2 logos)

One loader, `render/textures/LogoLoader.js`, serves both the upload (P2-13a) and the v2 import (P2-13e).

**Upload (`load({file})`).**
1. `file.size > MAX_LOGO_BYTES` → M-LOGO-2, stop (a fast pre-check before reading).
2. If the upload would add a new distinct image while `logos.distinctImageCount(sectionId) === MAX_LOGO_ASSETS` → M-LOGO-3, stop. (Replacing a section's only use of an image does not count as new.)
3. MIME: `image/png`, `image/jpeg`, `image/webp` and `image/svg+xml` are kept as they are. Any other type the browser can decode (GIF, BMP, AVIF) is drawn to a canvas at its natural size and re-encoded as PNG, so the stored MIME is always in the 07 §4.5 allowlist.
4. Raster: `readAsDataURL` (or the PNG `toDataURL` of step 3), then decode (below).
5. SVG: read as text, parse with `new win.DOMParser().parseFromString(text, 'image/svg+xml')`; a `parsererror` → M-LOGO-1. Sanitise, size, re-serialise with `XMLSerializer`, base64-encode to `data:image/svg+xml;base64,…`, then decode.
6. **Cap on the stored bytes.** `bytes` is the decoded length of the data URI that will be stored, measured **after** conversion and sanitising. Re-encoding can grow a file a lot (a compressed AVIF photo can become several times larger as PNG). If `bytes > MAX_LOGO_BYTES`:
   - a converted raster (step 3) is redrawn at `scale = 0.9 · sqrt(MAX_LOGO_BYTES / bytes)` of its current size and re-encoded, up to three times; if it fits, it is stored at that size (logos are drawn at a fraction of a panel, so the downscale is invisible in practice);
   - otherwise (an SVG, which is never rasterised, or a raster that still does not fit), M-LOGO-2. PNG, JPEG and WebP files are stored verbatim, so step 1 already bounds them.
   So the stored `dataUri` always satisfies the validator's cap, and the v2 writer never saves a logo its own reader would drop (§3.1).
7. `reader.onerror`, `img.onerror` or a failed decode → M-LOGO-1.
8. On success the `LogoLibrary` entry stores `{image, dataUri, mime, bytes, name}` (plus the existing `position`, `scale`). From P2-13e the loader also returns `sha256` (computed with the injected `digest` over the stored bytes, 07 §6.13), and the entry gets `assetId = 'a_' + sha256.slice(0, 16)`.

**SVG sanitising** (applied to every SVG, uploaded or imported):
- remove `<script>`, `<foreignObject>` (it taints canvases in Safari), `<iframe>`, `<object>`, `<embed>`, `<audio>`, `<video>`;
- remove every `on*` attribute;
- remove `href` / `xlink:href` values that are not a same-document fragment (`#…`) or a `data:image/(png|jpeg|webp);base64,` URL;
- in `style` attributes and `<style>` text, remove `@import` rules and every `url(…)` that is not `url(#…)`.

**SVG sizing (B-L35).** If the root lacks `width` or `height`, take `viewBox` (or default to 1024×1024), then set `width = 1024` and `height = round(1024·vbH/vbW)`.

**Import (`load({dataUri})`, P2-13e).** The validator (pure) first checks each `assets[]` entry of kind `logo` with `parseLogoDataUri` (`domain/LogoRules.js`):
```
m = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/]*={0,2})$/.exec(s)    -> else null
mime = m[1] must equal assets[].mime
b64 = m[2]; b64.length % 4 === 0                                                          -> else null
s.length ≤ MAX_LOGO_DATAURI_CHARS
padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
bytes = 3·b64.length/4 − padding ≤ MAX_LOGO_BYTES
atob(b64) does not throw, and atob(b64).length === bytes                                 // round-trip check (atob exists in Node ≥ 16)
```
- Anything else (an `http(s):` URL, `blob:`, `javascript:`, `data:text/html`, malformed base64, an oversize image) drops the logo with a correction (`code: 'sanitized'`, label `Logo "<name>"`). **No network request is ever made**, so no IP leaks and no canvas is tainted, and Export Panel IDs and Export All (ZIP) keep working.
- `bytes` and `sha256` stored in the entry are recomputed from the data: a different `bytes` is corrected silently (it is derived), and a `sha256` mismatch keeps the asset with a warning (07 §4.5 integrity).
- A section's `logo.asset_id` that names no valid logo asset is dropped with `missing-asset`.
- More than `MAX_LOGO_ASSETS` logo assets: the assets after the 64th are dropped, each with a `sanitized` warning; the file still opens.
- The app layer then calls `LogoLoader.load({dataUri})` for each surviving asset, which sanitises SVGs and decode-checks every image; a failure also drops the logo with a correction.

**Drawing guard** in `PanelIdRenderer#drawLogo`: `if (!img.naturalWidth || !img.naturalHeight) return`.

### 6.17 v2 import: restore order (P2-13e)

`ProjectIO.#applyV2(result)` runs only for a validated v2 result (`scope: 'full'`), after every logo has been loaded (`await` per asset). Two rules shape the order:
- `setPreviewEnabled(true)` calls `resetPose()`, which overwrites the camera pose, so **the pose is applied after the preview is enabled**;
- `WallController.applyImport` clears the logo library before it rebuilds (the B-L21 fix), so **the imported logos are handed to `applyImport`**, which installs them after the clear and before the rebuild. Installing them in a separate step before the call would lose them.

Pose events are emitted by the controllers at their model-write points (ARCHITECTURE §5.2), never by `ProjectIO`.

```
1. if (interaction.pilotMode) pilot.toggle()                       // clean exit (P2-4)
2. selection.deselect()
3. logos = Map(sectionId -> {image, dataUri, mime, bytes, name, sha256, assetId, position, scale})   // from the loaded assets
4. wallController.applyImport({sections, meshMode, logos})
       -> project.logos.clear(); project.logos.set(id, entry) for each; wall.replaceAll(sections); rebuild
       -> WALL_SECTIONS_CHANGED{import}; panel IDs draw the logos in this first rebuild
5. display and style (each setter only when the value differs):
     panelIdStyle: wallController.setPanelIdStyle(key, value) for each key (model only)
     wallController.setLedLayout(layout); setWireframe(on); setShowFrame(on)
     content: setLedSim(true) | setPanelIds(true) | the current one off
     if a style key changed and no rebuild ran in this step: wallController.rebuildIfPanelIds()
6. camera lens: cameraController.setFilmback(key); if custom: setCameraField('filmbackWidth'|'filmbackHeight', mm);
   setCameraField('focalLength', mm)
7. camera enable: if (camera.enabled !== cine.enabled) cameraController.setPreviewEnabled(camera.enabled)   // may resetPose()
8. camera pose: cameraController.applyImportedPose({posX, posY, posZ, rotX, rotY, rotZ})
       -> cine.assign(pose) (validated values; no UI minimum, so posZ < 0.1 survives before P2-11c)
       -> bus.emit(CAMERA_POSE_CHANGED, {source: 'import'})
       -> if (cine.enabled) hub.refresh(); else keepPoseOnNextEnable = true
9. safe distance: if it differs, cameraController.setSafeDistanceEnabled(display.show_safe_distance)
10. props, each: propController.applyImportedPose({posX, posZ, rotY, scale})
       -> prop.assign(...); bus.emit(PROP_POSE_CHANGED, {id, source: 'import'}); applyTransform()
    then, if visibility differs, propController.setVisible(v)
11. bus.emit(PROJECT_REPLACED, {reason: 'import', scope: 'full'})  // panels syncFromModel()
12. if (warning issues) dialogs.alert(M-IMP-5)
```

**A pose saved while the preview was off.** Legacy resets the pose every time the preview is turned on, so without a rule the saved pose of a disabled camera would be discarded on first use. Decision (Q19): `applyImportedPose` on a disabled camera sets `keepPoseOnNextEnable`; the next `setPreviewEnabled(true)` skips `resetPose()` once and clears the flag. In-session toggling is unchanged (it still resets), so no harness output depends on the flag except `p2_project_v2`.

07 r2's `ProjectSession.apply` assigned the camera pose in step 3, before `setPreviewEnabled` in step 4, and would have lost it; amendment A4 (§5.6.1) asked for `applyImportedPose` after the enable. 07 r3 adopted it (07 §5.5.2: preview step 4, poses step 5; C30).

### 6.18 Toggle state sync (B-L36)

```js
// js/ui/dom.js (P2-13c)
export function setToggle(el, on) {
  el.classList.toggle('active', on);
  el.setAttribute('aria-checked', on ? 'true' : 'false');
}
/** ARCHITECTURE's legacy toggle idiom, kept for every existing click handler, now on top of setToggle. */
export function flipToggle(el) {
  const on = !el.classList.contains('active');
  setToggle(el, on);
  return on;
}
```
Every write of a `div.toggle`'s state uses one of the two: the click handlers (through `flipToggle`, unchanged call sites), the forced-off pair in the `DISPLAY_CONTENT_CHANGED` mirror (LED sim ↔ panel IDs), the preview-off path, and every `syncFromModel()` (P2-13e). The `p2_project_v2` scenario records a `toggle_aria` probe (`aria-checked === String(classList.contains('active'))` for every `div.toggle`) after each step, including a forced-off pair.

---

## 7. Export impact

| Format | P2-1 | P2-2 | P2-3 | P2-5 | P2-6 | P2-7 | P2-13 |
|---|---|---|---|---|---|---|---|
| **OBJ** (combined) | – | CCW faces; per-vertex `vn` (averaged); `f a/a/a`; the orientation header line (01 CR-3) | dispatch hardening only | – | – | atlas `vt` (multi-section only); `usemtl Wall_<i>` per section | – |
| **OBJ** (section) | – | CCW faces; per-vertex `vn`; header line | – | – | – | – | – |
| **OBJ** (panel) | – | CCW faces (`vn` unchanged); header line | – | – | – | – | – |
| **MTL** | ZIP: no `map_Kd` for a skipped texture | – | – | – | standalone: no `map_Kd`; ZIP: `map_Kd textures/<unique>_PanelIDs.png` | combined: one `newmtl Wall_<i>` per section, replacing `newmtl LED_Wall_Combined` (+ `map_Kd textures/panel-ids.png` in the ZIP if Q5 = yes) | – |
| **glTF** | chunked base64 (byte-identical below 125 KB); Uint32 indices at a maximum index ≥ 65,535 | CCW indices; `NORMAL` | – | – | – | `TEXCOORD_0` (v flipped); combined = one primitive with its own accessors and one material `Wall_<i>_Material` per section | `asset.generator` stays (Feature 6 rebrands) |
| **JSON** (file) | – | – | written from validated values | – | – | – | v2 per 07 §4.2 (`"version": "2.0"`, snake_case superset of v1, `assets[]` for logos; §4.6) |
| **JSON** (ZIP) | `texture_file: null` for skipped textures | – | – | – | `angle_offset_degrees` present; unique `texture_file` | – | v2 `zip` variant (as the file, plus `texture_file` per section) |
| **ZIP** | no silent death; oversize textures skipped and reported | OBJ/glTF entries as above | – | – | unique names; JSON fixed | atlas `textures/panel-ids.png` in every mode (Q5), guarded like the section textures | – |
| **PNG** (`panel-ids.png`) | size guard + message | – | – | – | – | – | – |
| **Safe-distance OBJ** | – | – | – | downloads (P2-5a); shared-vertex strip; faces +Y; `vn 0 1 0`; mitred and clamped; a `# Clamped:` header line when any offset vertex is closer than D (P2-5b) | – | – | – |

**Never changed by Phase 2.**
- File names: `Theme.brand.files` (Feature 6 owns them). The one new ZIP entry, `textures/panel-ids.png` (P2-7f), is named by 04 §2.3 (b).
- Object and mesh names: `Wall_<i>`, `Wall_<s>_Panel_R<r>_C<c>` and `LED_Wall_Combined` (object and mesh).
- **Material names, except** the combined material: P2-7d replaces `LED_Wall_Combined` (MTL) and `LED_Wall_Combined_Material` (glTF) with the per-section `Wall_<i+1>` / `Wall_<i+1>_Material`, including on single-section walls (04 Q11). Section- and panel-mode material names are unchanged.
- Vertex positions in any mode, except the safe-distance band on curved or angled walls.
- MTL `Kd`/`Ka`/`Ks`/`Ns`/`d` values.

---

## 8. Testing

### 8.1 The re-baseline procedure (one run per commit)

Phase 1 compared every candidate against a baseline captured from the pristine `cd3fd3f`. In Phase 2:
- **The baseline for a commit is the harness output of its parent commit.**
- **Each intentional change is declared up front in an expected-change manifest.**
- **This is the only procedure.** Sibling specs (01, 04, 07, …) use it for every commit that changes a golden output. `run.mjs --only` is for local iteration only and never produces a promoted baseline (§5.6).

```bash
# 0. Baseline = the parent commit. Skip this if tests/regression/output/baseline was promoted by the previous commit.
git worktree add ../led-baseline HEAD
node tests/regression/run.mjs --root ../led-baseline --out tests/regression/output/baseline
git worktree remove ../led-baseline

# 1. Implement ONE commit (one bug id x one consumer). Write tests/regression/expected/<commit-id>.json first.
GOLDEN_DIR=./no-golden node --test "tests/unit/**/*.test.mjs"   # golden-file tests skip; oracle + new unit tests run
node tests/static/check.mjs && node tests/static/css-slices.mjs

# 2. Full candidate run (never --only: unexpected diffs elsewhere must be caught)
node tests/regression/run.mjs --root . --out tests/regression/output/candidate

# 3. Gate: every diff must be declared, and every declared change must happen.
#    --expect always loads tests/regression/expected/_nondeterminism.json as well (§8.2); it is never listed by hand.
node tests/regression/compare.mjs tests/regression/output/baseline tests/regression/output/candidate \
     --expect tests/regression/expected/<commit-id>.json --verbose
#    Export commits also run the structural checks on the candidate outputs:
node tools/check-orientation.mjs tests/regression/output/candidate/*/*.obj tests/regression/output/candidate/*/*.gltf
node tools/check-gltf.mjs tests/regression/output/candidate/*/*.gltf

# 4. Human review of every EXPECTED diff: open both PNGs side by side, diff OBJ/glTF text, read dialogs/console.
#    For P2-2a (viewport winding) and similar invariance commits the expect list is EMPTY: any diff outside mayChange is a bug.

# 5. Promote the reviewed candidate
rm -rf tests/regression/output/baseline && mv tests/regression/output/candidate tests/regression/output/baseline

# 6. Self-consistency + golden unit tests against the promoted baseline
node tests/regression/run.mjs --root . --out tests/regression/output/candidate
node tests/regression/compare.mjs tests/regression/output/baseline tests/regression/output/candidate   # must exit 0
node --test "tests/unit/**/*.test.mjs"                                                               # GOLDEN_DIR default

# 7. Commit: code + expected/<commit-id>.json + ARCHITECTURE §8 amendment.
#    Message: "fix(B-xx): <what>; re-baselined: <manifest id>"
```

**Rules.**
- A commit whose step 3 shows an undeclared diff is **not** re-baselined. Either the code is fixed, or the manifest is corrected with a written reason in the commit message.
- **The only diffs that may stay undeclared are the entries of `expected/_nondeterminism.json`, within their bounds.** That file is the harness README's "Known nondeterminism" turned into data (§8.2): the overlay-glyph jitter of DOM text over a WebGL canvas (at most 1 level, at most 8 pixels, in the screenshots where a self-consistency run of an unchanged build has shown it), and nothing else. `compare.mjs` reports such a diff as `JITTER`; it neither fails the gate nor satisfies an `expect` entry. A difference on a listed output that exceeds its bounds is an ordinary WARN or FAIL.
- Any other undeclared screenshot WARN must be reviewed, and declared under `mayChange` with a reason if it is accepted. Nobody adds jitter entries to a commit manifest.
- **Adding to the allowlist** is a separate commit that changes no code: it attaches the self-consistency evidence (two runs of the same build, the output name, the maximum level and pixel count, the overlay element) and updates the README section in the same commit. P2-0 creates the file from the README's list plus whatever its own two full self-consistency runs show (§10, T0.6).

### 8.2 Tooling (P2-0)

**Manifest format** (`tests/regression/expected/<commit-id>.json`, committed):

```json
{
  "commit": "P2-1a",
  "bugs": ["B-H3"],
  "expect": [
    { "output": "large_wall/panel__export-gltf__*.gltf", "change": "added" },
    { "output": "large_wall/{downloads,console}.json", "change": "modified", "each": true },
    { "output": "import_edge/{console,dialogs,i_dialogs}.json", "change": "modified", "each": true },
    { "output": "p2_oversize_canvas/{console,dialogs}.json", "change": "modified", "each": true }
  ],
  "mayChange": []
}
```

**One harness-only PR series (07 C57).** P2-0 is the first of: **08 P2-0** (`--expect`, the nondeterminism allowlist, the `p2_*` scenarios) → **01 T2** (rect allowances as a `rects` field on `--expect` manifest entries, measured by `measure-rects`) → **07 G3** (determinism, per-scenario storage clearing and browser-context isolation, `?autosave=off`, the toast log, the print and clipboard hooks; it absorbs 09 T0.1) → **G4** → **G6**. Every rect-limited step in any spec (01 F1-2, 06 T4b, 07 I4a's single help-badge rewrite) declares its rectangles with `rects` on its `--expect` entries; there is no `compare --allow`.

**Patterns** are matched against `<scenario>/<output>`. `*` matches within one path segment, `**` matches across segments, and `{a,b}` is alternation. `change` is `added | removed | modified`.

**How a manifest is written (R10).** Never from memory:
1. List what the commit touches: an export kind, a DOM field, a dialog, a state key.
2. Grep the parent's promoted baseline for it, for example `grep -rl '"camera-preview-res"' tests/regression/output/baseline` for a preview label, `grep -l 'map_Kd' …/*/*.mtl` for MTL texture lines, or the non-empty `console.json`/`dialogs.json` files for a change to error handling.
3. Write **segment-agnostic, filename-agnostic patterns** for whole output kinds: `**/*__export-obj__*.obj`, `**/*combined__export-*` (this also matches `import_edge/ii_combined__…`), `**/*section__export-obj__*.mtl`. They keep working when a scenario is added and when Feature 6 T6b renames the files.
4. Use explicit names only for single outputs, and check each against the baseline listing.
Step 3 of the gate then catches anything still missed.

**Standing nondeterminism allowlist** (`tests/regression/expected/_nondeterminism.json`, committed, created in P2-0; loaded by every `--expect` run):

```json
{
  "jitter": [
    { "output": "keyboard/{pilot_view,final_view}.screenshot.png", "maxLevel": 1, "maxPixels": 8,
      "overlay": "pilot banner, help badge", "evidence": "README Known nondeterminism; 2 runs of the original" },
    { "output": "preview_resize/*.screenshot.png", "maxLevel": 1, "maxPixels": 8,
      "overlay": "preview header and footer", "evidence": "README; captures of the original" },
    { "output": "pilot_look/*.screenshot.png", "maxLevel": 1, "maxPixels": 8, "overlay": "pilot banner, preview labels", "evidence": "README" },
    { "output": "preview_off_in_pilot/*.screenshot.png", "maxLevel": 1, "maxPixels": 8, "overlay": "pilot banner", "evidence": "README" },
    { "output": "camera/*.screenshot.png", "maxLevel": 1, "maxPixels": 8, "overlay": "preview labels", "evidence": "README (ES-module build)" },
    { "output": "gizmo_drag/*.screenshot.png", "maxLevel": 1, "maxPixels": 8, "overlay": "help badge, preview labels", "evidence": "README (ES-module build)" },
    { "output": "import_edge/i_empty.screenshot.png", "maxLevel": 1, "maxPixels": 8, "overlay": "preview labels", "evidence": "README (ES-module build)" },
    { "output": "toggles/15_car_moved.screenshot.png", "maxLevel": 1, "maxPixels": 8, "overlay": "help badge", "evidence": "README (ES-module build)" }
  ]
}
```

- The entries are exactly the README's list ("…" in the README's ES-module list is resolved by P2-0's own two self-consistency runs of the full harness on the P2-0 build: every screenshot that differs between those two runs is added with its measured level and pixel count, and nothing else).
- A screenshot diff on a listed output with `maxChannelDiff ≤ maxLevel` and `differingPixels ≤ maxPixels` is reported as `JITTER`: it does not count, and it does not satisfy an `expect` entry. Anything larger keeps its normal status.
- ZIP container bytes need no entry: ZIPs are already compared by entry list and content.

**`compare.mjs --expect a.json[,b.json]` semantics:**
1. A differing output (status FAIL, WARN, MISSING or EXTRA) that matches an `expect` entry with a compatible `change` is reported as `EXPECTED` and does not count.
2. One that matches `mayChange` is reported as `EXPECTED?` and does not count.
3. Any other difference keeps its normal status.
4. **An `expect` entry is satisfied only by a differing output.** A screenshot whose difference stays within the comparison tolerance is a PASS, and a PASS does **not** satisfy an `expect` entry. Without `each`, an entry is satisfied when at least one matching output differs; with `"each": true`, every matching output present in the baseline must differ. An unsatisfied entry is a **FAIL** (`expected change did not occur`). This catches fixes that silently no-op.
5. Consequently, a change that may fall under the screenshot tolerance is declared under `mayChange`, never under `expect`.
6. `_nondeterminism.json` is applied before rules 1–3 (`JITTER`, above).
7. The exit code is 0 iff there is no FAIL.

Implementation size: about 120 lines in `compare.mjs`, plus README documentation and a unit test with two synthetic output trees.

**Request log (opt-in).** The harness records only failed requests (`Network.loadingFailed`, HTTP ≥ 400), so a successful fetch of an external URL would be invisible. P2-0 adds a per-scenario flag `recordRequests: true`: `lib/app.mjs` keeps the URL of every `Network.requestWillBeSent` from the scenario's first step on, except while a page (re)load is in progress (`AppPage.open` and `AppPage.reload()`: the CDN scripts and fonts of every fresh page are page loads, not scenario requests), and the recorder writes `network.json` with the `http(s)` URLs whose origin is not the app's own (data and blob URLs are not requests to anyone), each (step, URL) pair once. The scenario preloads every web-font face before its first step and inside each reload, so a lazy font download never enters the log. Only `p2_project_v2` sets the flag, so no other scenario gains an output.

**Structural checkers** (Node, no dependencies, in `tools/`; D1 forbids npm runtime dependencies and the repo has no `package.json`):
- `tools/check-orientation.mjs <file.obj|file.gltf…>`: parses OBJ (`v`, `vn`, `f`) and glTF (embedded buffers); for every triangle, `dot(geometric normal, vertex normal) > 0` at all three vertices (a triangle without vertex normals, or with zero area, fails); prints a per-object pass/fail and exits 1 on any failure. Specified in 01 §8.1, shipped here. It is the "scripted check" of criterion 10.
- `tools/check-gltf.mjs <file.gltf…>`: the structural subset of the Khronos rules that Phase 2 relies on: accessor `count` and bufferView bounds, `byteOffset` 4-byte alignment, index values below the component maximum (no 65,535 in 5123, none equal to 4,294,967,295 in 5125) and below the primitive's vertex count, `POSITION` min/max present and correct, compared after `Math.fround` (the legacy writer stores float64 min/max of values that the buffer holds as float32, so an exact comparison would fail every legacy-shaped file; this is the second rejected report in `docs/DEFECTS.md`), `NORMAL` unit length (±1e-6), `TEXCOORD_0` count equal to `POSITION` count, material and mesh references valid. Exit 1 on any failure.
- **The Khronos glTF-Validator** itself is used through its official web page (github.khronos.org/glTF-Validator; files are validated locally in the browser) as a recorded manual step (§8.6). Its report (0 errors) is attached to the commit's pull request for criteria 7 and 12.

### 8.3 New harness scenarios (`tests/regression/scenarios-phase2.mjs`, P2-0)

All eight are captured at P2-0 **against the unfixed code**, so their baselines document the bugs. Each later fix then changes them intentionally. Payloads never reference a reachable URL: the harness fails on network errors, and `p2_project_v2`'s request log proves that none is fetched.

**Download labels.** Export steps are labelled `<mesh mode>__<button>` (for example `section__export-obj`, `combined__export-zip`) or `<wall>__export-safe-distance`, so that the segment-agnostic patterns of §8.5 (`**/*section__export-obj__*.mtl`, `**/*combined__export-*`) cover the new scenarios exactly like the config scenarios.

**Fresh pages.** A fresh page inside a scenario is `AppPage.reload()` (§8.2, request log). Console errors and downloads keep accumulating across it, and it keeps the dialogs of the page it leaves, so `dialogs.json` lists the dialogs of every page of the scenario; `p2_project_v2` also records each page's dialogs on their own.

**Record names that later manifests rely on.** `p2_project_v2` writes its `toggle_aria` probes as `toggle_aria_<step>.json` (P2-13c declares `p2_project_v2/*toggle_aria*.json`) and the stored SVG text as `stored_svg_08_hostile.json`.

| Scenario | Steps | Records | Covers |
|---|---|---|---|
| `p2_xss_names` | 1. Import a config with 6 sections named `<b id="xss-probe">B</b>`, `Say "hi"`, `A B`, `A_B`, `Dup`, `Dup`; one colour `red;outline:3px solid lime`; `mesh_mode: 'section'`. 2. Record `sections_initial` and `xss_probe` = `!!document.getElementById('xss-probe')`. 3. Turn panel IDs on, then probe again. 4. Rename card 1 to `<i id="xss-probe2">i</i>` and probe again. 5. `section__export-obj` (expect 2 downloads), then `section__export-zip` | sections snapshot, probes, logo list, dialogs, MTL, ZIP entries, ZIP JSON | B-M4, B-L8 (colour), B-L14, B-M2, B-L21 |
| `p2_zip_section_mode` | Import `flat3` with `mesh_mode: 'section'`, rename `Center` to `Center Stage`, then `section__export-obj` and `section__export-zip` | MTL, ZIP entries (`.mtl`, `textures/*`, JSON) | B-M2, B-L7 |
| `p2_curved_safe_distance` | For each of `concave_offsets`, `convex`, `box_corner` and the inline `concave30` (one section, 6 × 4 panels of 500 mm, curve 30°), each on a fresh page: import; turn the preview on; set pos (3, 1.5, 6); turn safe distance on; screenshot `<wall>`; `<wall>__export-safe-distance` | 4 screenshots, 4 OBJs, console, downloads | B-M15, B-L29, B-M1 |
| `p2_zero_inputs` | Turn the preview on; set `#camera-pos-y` 0 and `#camera-pos-z` 0; set card 0 `panelWidth` 0 and `panelCols` 2.5; turn panel IDs on and set `#panel-border-thickness` 0; `combined__export-obj` | `cameraState`, `sectionsSnapshot`, `uiState`, stats, OBJ export | B-L9, B-L15, Q13 |
| `p2_oversize_canvas` | Import one section: cols 70, rows 2, ledX 1000, ledY 64 (70,000 px atlas width), `mesh_mode: 'section'`. (P2-0 measured the harness browser, Chrome 154: canvases up to 65,535 px per side and 268,435,456 px in area work, so the 50,000 px wall of revision 3.1 exported correctly there; 70,000 px makes the unfixed Export Panel IDs throw and the ZIP texture 0 bytes in the harness too. P2-1's guard keeps the stricter 32,767 px limit of other browsers.) `section__export-panel-ids`, then `section__export-zip`. Then turn panel IDs on and take a screenshot (`panel_ids_viewport`) | dialogs, console (exceptions only, §2.4), downloads, ZIP entries and MTL, screenshot | B-L4 (exports and viewport) |
| `p2_mixed_content` | Import `mixed`; turn LED sim on (combined), screenshot; layout `square`, screenshot; turn panel IDs on, screenshot | 3 screenshots | B-M5, B-L18 |
| `p2_shortcut_filters` | 1. Turn LED sim on (so that `#led-layout` is shown and can take focus), focus `#led-layout` and press `g` (gizmo state). 2. Press Ctrl+G. 3. Press `p` with `autoRepeat: true` ×3 after enabling the preview. 4. Press Escape and one plain `p` (pilot mode from either outcome of step 3), click `#view-front`, then take a screenshot and the gizmo state | gizmo states, screenshot | B-L11, B-L25 |
| `p2_project_v2` (`recordRequests: true`) | 1. Turn the preview on; set a custom filmback 30×20, focal 50, pos (2, 1.2, 4), rot (5, −10, 2); safe distance on. 2. Person visible at (1, 3), rot 45, scale 1.5; car visible. 3. Add Section (the default wall has one section, so that section 1 exists); LED sim on, then panel IDs on (forced-off pair); border 12, font colour `#ff0000`; upload the test PNG logo to section 0; upload a generated 2,000,000-byte 24-bit noise BMP to section 1 (its PNG conversion exceeds 2 MB, so the downscale path of §6.16 runs); wireframe on. 4. `v2_first__export-json`. 5. Fresh page; import that JSON. 6. Record states and a screenshot; `v2_second__export-json`. 7. Turn the preview off (a click only if it is on: the restored state differs before and after P2-13e); `v2_off__export-json`; fresh page; import it; turn the preview on (only if it is off); record `cameraState` (Q19: the saved pose, not the reset pose). 8. Import an inline one-section v2 file (`mesh_mode: "combined"`, panel IDs on) whose `assets[]` logos are an `https://` URL, a `data:text/html` URI, a data URI whose base64 length is not a multiple of 4, and an SVG with `<foreignObject>`, `<script>` and an external `href` (the SVG is the section's logo; every URL uses the never-resolving `.invalid` domain); record dialogs and the logo list; then `combined__export-panel-ids` and `combined__export-zip`, and record the stored SVG text from that archive (every `.svg` entry and every base64 `data:image/svg+xml` URI of its JSON entries, decoded: the DOM never shows a logo's bytes, and the archive holds the inline project JSON and, from 07 D6 on, the `assets/<id>.<ext>` files) | `cameraState`, `uiState`, `toggle_aria`, logo list (with the stored `bytes`), dialogs, console, `network.json` (must be empty), screenshot, the three JSON exports, the stored SVG text | B-L31, B-L35, B-L36, §6.16, §6.17 |

### 8.4 Unit tests per batch

| Batch | File | Tests |
|---|---|---|
| P2-0 | `geometry.test.mjs`, `io.test.mjs` | Re-pointed: the oracle comparisons use `LegacyProfiles.mesh.*`; the golden comparisons use `Strategies.mesh.*`. Both pass at P2-0 |
| P2-0 | `compare.test.mjs` (new) | The §8.2 semantics on synthetic trees: undeclared diff → FAIL; unsatisfied `expect` → FAIL; a within-tolerance screenshot does not satisfy `expect`; `each`; `{a,b}` patterns |
| P2-0 | `tools.test.mjs` (new) | `check-orientation` and `check-gltf` pass on hand-built good files and fail on a reversed triangle, a 65,535 index in 5123, and a misaligned bufferView. `check-gltf` accepts float64 `POSITION` min/max whose `Math.fround` equals the stored extreme, and rejects a min/max that is off by one float32 ulp |
| P2-0 | `compare.test.mjs` | `_nondeterminism.json`: a 1-level, 5-pixel diff on a listed screenshot is `JITTER` and exits 0; a 2-level diff on the same output is a WARN; a jitter-sized diff on an unlisted output is a WARN; `JITTER` never satisfies an `expect` entry |
| P2-1 | `io.test.mjs` | `chunkedBase64` equals `legacySpreadBase64` on random buffers of 0 … 100,000 bytes (copy the legacy one into the test before deleting it), and does not throw at 10 MB. A 70,000-vertex grid emits `componentType 5125` with indices round-tripping exactly. Below 65,536 vertices, the output is byte-identical to before |
| P2-1 | `geometry.test.mjs` | `canvasFits` boundaries: 32767 ✓, 32768 ✗, area 268,435,456 ✓, +1 ✗. `indexWidth`: 65,534 → `'uint16'`, 65,535 → `'uint32'`. Grids of exactly 65,535 and 65,536 vertices pick Uint16 and Uint32 respectively, in the glTF writer and in the viewport index helper |
| P2-1 | `io.test.mjs` | ZIP pre-check: a skipped section's JSON `texture_file` is `null` and the MTL has no `map_Kd` for it; the atlas is skipped and listed when oversize |
| P2-1 | `materials.test.mjs` (fake THREE, `win.console` spy) | P2-1d: an oversize section canvas, atlas or **panel** canvas (`ledX` 8,192 in panel mode) returns `null`; `LEDMaterialFactory` falls back to the colour material and warns exactly once per rebuild, naming the section |
| P2-2 | `geometry.test.mjs` | For random layouts, every CCW triangle's geometric normal has a positive dot product with its stored vertex normals. **Per quad**, the two new triangles equal the two legacy triangles with reversed orientation: new triangle 0 is legacy triangle 1 with its last two vertices swapped (`[a, c, b]`), and new triangle 1 is legacy triangle 0 swapped the same way. Flat sections (01 CR-1): every `'averaged'` normal is `Object.is`-equal, component-wise, to the `'right-panel'` output, and within 1e-12 of `(−sin a, 0, cos a)`, including `large_wall` L3 at 40° (the case a per-vertex short-circuit gets wrong). Curved sections: interior normals are unit bisectors, exactly half the turn angle `c/2` (in absolute value) from each adjacent face normal (1e-12 rad); end columns equal their panel normal |
| P2-2 | `io.test.mjs` | OBJ: `vn` count equals `v` count (strip modes) and face triples are `a/a/a`. glTF: a `NORMAL` accessor exists for every primitive, normals are unit length (±1e-6) and the indices are CCW |
| P2-3 | `validator.test.mjs` (new) | Every row of §4.3, with 07's issue shape (`path`, `code`, `severity`, `message`, `from`, `to`) and codes: v1 `\|\|` defaults are silent (`columns: 0` → 5, no issue, as legacy); `"10"` → 10 (`coerced`); 2.5 columns → 3 (`rounded`); `[]`/`{}` → default (`defaulted`); clamping at both bounds (`clamped`); ids per 07 §6.8 (`[1, 1, 2, missing]` → `[1, 4, 2, 3]`; `'abc'` → 0; `reassigned-id`); 0, 201 and non-array sections rejected (`no-sections`, `limit-exceeded`) with the exact §3.3 messages and `project === null`; the dispatch: `null` and `[]` → `unsupported-format`; `format: "x"` → `unsupported-format`; `version` absent, `"1.0"`, `1` → v1; `"2.0"` → `newer-version` before P2-13e; `"3.0"` → `newer-version`; `mesh_mode` falsy keeps the current mode, `"weird"` → `combined` with a warning; colour normalisation; names: numbers coerced, C0, C1 and bidi overrides stripped, 33 characters truncated without splitting a surrogate pair, leading and trailing spaces kept (A3); `nextSectionId` recomputed; idempotence (`validateProject(validateProject(x).project)` raises nothing); every config in `tests/regression/configs.mjs` produces zero warnings (only the `migrated` info) |
| P2-3 | `wall-controller.test.mjs` | `addSection` at 200 sections alerts M-SEC-1 and adds nothing; a 200-section wall exported by the serializer re-imports with zero warnings; `applyImport({sections, meshMode, logos})` installs the given logos **after** clearing, and `applyImport({…, logos: null})` leaves the library empty |
| P2-3 | `domain.test.mjs` | `WallSection.setName` stores exactly what the validator would store for any input (property test over random strings with controls, bidi characters, surrogate pairs and 0–40 characters) |
| P2-3 | `core.test.mjs` | `escapeHtml` on `&<>"'` and on non-strings |
| P2-5 | `safe-distance-band.test.mjs` (new) | Flat polyline: positions equal the legacy quads, deduplicated. Mitre invariant `offset·m[k-1] = offset·m[k] = d[k]` at every mitred vertex. **Concave 30° arc with r < D** (0.5 m panels, D = 1.88 m and 2.92 m): every kept triangle is +Y with positive area, interior `d = (0.5 − 0.001)/(2·tan 15°)`, end `d = r − 0.001`, and no safe vertex lies farther than the circumradius from the centre of curvature. **`box_corner`** (D = 2.19 m): every triangle +Y; the corner vertices and their neighbours have `d = 0.499`; the documented Back/Front overlap is asserted as present (so a future clip changes this test deliberately). `concave_offsets`: exactly three clamped vertices (2.415, 2.415, 2.58 m), coloured `'clamped'`; `clampedVertices` and `totalSafeVertices` feed the OBJ header line; flat walls have `clampedVertices === 0` and no header line. Fold-back > 166° splits. Fuzz: 10,000 random walls (1–4 sections, curves up to ±60°, offsets up to ±180°, D up to 15 m) produce no triangle with a −Y normal |
| P2-6 | `geometry.test.mjs` | `textureFileNames`: no collisions (`A B`/`A_B`, `Dup`/`Dup`/`dup` → `A_B`, `A_B_2`, `Dup`, `Dup_2`, `dup_3`); stable for unique names |
| P2-6 | `io.test.mjs` | The `'zip'` JSON equals the `'file'` JSON plus `texture_file` per section |
| P2-7 | `geometry.test.mjs` | `uvHeight` is 1 for equal heights (bit-identical `v`); for `mixed`, `v_max = rows·ledY/totalLedY`. glTF writer `v' = 1 − v`. Combined glTF: one primitive per section with its own accessors and material `Wall_<i+1>_Material` |
| P2-8 | `domain.test.mjs` | The §4.4 rule table over the seeded grid (`0`, `''`, `NaN`, negatives, fractions, numeric strings). P2-8a: every value a `FIELD_RULES` entry can produce passes the P2-3b validator rows unchanged (the reachability property, run again in P2-3b). The B-L9 effect table is asserted row by row. `wrapDeg`: −180 → 180, 180 → 180, 190 → −170, 0 → 0. `pilotFly` floor 0; no Z clamp in `translateBy` or `pilotFly` |
| P2-8 | `wall-controller.test.mjs` | Row 8 becomes 1 rebuild per click |
| P2-9 | `domain.test.mjs` | `eulerYXZ` round trips; world-Y +90° on (0,0,0) gives rotY 90; world-X +10° with rotY 90 changes the roll channel (the B-L28 example); local versus world composition differ for rotX ≠ 0; with rotX = rotZ = 0 a world-Y rotation equals the Euler sum (why `gizmo_drag` cannot see P2-9f) |
| P2-10 | `geometry.test.mjs` | `clampPreviewSize` per axis (B-L32: 100×1 mm and 1×100 mm filmbacks stay within 200–800 × 120–600); `letterboxRect` keeps the aspect within 1e-9 and centres the image; the default 316 × 176 inner box with Full Frame gives a 264 × 176 image |
| P2-11 | `frustum-coverage.test.mjs` (new) | `flat3` unrotated poses over a grid of positions (including a frame entirely above the wall and one wider than the whole wall) reproduce the legacy `coverage()` numbers and status, except the documented "entirely off the wall" case (`Object.is` on width/height). A 90° pan gives `offWall`. A camera behind the wall gives `offWall` with `D0 = null`. Box-corner hits pick the nearest quad. `extentAcross`: a flat wall along Z (single section, 90° offset) and at 45° give the same width as along X; `width` and `fits` use the same measure. `resetTo` on `flat3` equals legacy (`Object.is`, `rotY` is `+0`); on a single 180°-offset section it gives negative `posZ` and `rotY = 180` (`atan2` returns −180 there; `wrapDeg` maps it to 180). With an injected non-identity `postTransform`, `columnQuads` and `worldVertices` are transformed. A wide, short frame crossing a tall column without containing a corner of it touches the wall (polygon overlap). **Depth units:** for every corner that hits, the camera-space far corner `(sx·tx·z, sy·ty·z, −z)` with `z = cornerDepths[c]` equals the hit point within 1e-9 m; with no hit and `D0` present the depth is `D0`; with neither it is 15. `layout.columnQuads()` returns the same array object on repeated calls (memoised) |
| P2-12 | `core.test.mjs` | `LruCache`: capacity, recency update on `get`, `onEvict` called with the evicted value, `clear` evicts all |
| P2-12 | `camera-hub.test.mjs` (spies) | `refresh({poseOnly: true})` calls `rig.updateFrustumDepths` with the analyser's depths, and never `rebuildFrustum` or `syncSafeDistance`; `refresh()` (lens change) calls both; the first enable builds the frustum once |
| P2-12 | `camera-rig.test.mjs` (fake THREE) | `rebuildFrustum` records 12 far slots per corner across the two geometries (the slot lists of §6.10 for the legacy order); after `updateFrustumDepths(d)` every far vertex of the `LineSegments` **and** of the fill mesh equals `(sx·tx·d_c, sy·ty·d_c, −d_c)`, the near vertices are unchanged, and both bounding spheres were recomputed |
| P2-12 | `geometry.test.mjs` | Panel UV remap (panel IDs only): for every panel, BL/BR/TR/TL equal `((col + u)/cols, (row + v)/rows)`, and shared corners of neighbouring panels equal the section-mode strip UVs bit for bit. LED sim and colour panels keep `PANEL_UVS`. `panelModePxPerLed` reproduces 07 §6.12's table (default wall 16, 15 panels of 176² → 8, `large_wall` → 3, one panel of 1024² → 4) |
| P2-13 | `logo-rules.test.mjs` (new) | `parseLogoDataUri` accepts the four MIME types; rejects `https://…`, `blob:`, `javascript:`, `data:text/html;base64,…`, a MIME that differs from `assets[].mime`, a base64 length that is not a multiple of 4, characters outside the alphabet, `=` padding in the middle, and payloads over `MAX_LOGO_BYTES`; the byte count `3·len/4 − padding` equals `atob(b64).length` for lengths 0 … 12 with 0, 1 and 2 padding characters |
| P2-13 | `logo-loader.test.mjs` (fake `win` with canvas, `Image`, `DOMParser`) | A converted raster whose PNG exceeds `MAX_LOGO_BYTES` is downscaled until it fits (stored `bytes ≤ MAX_LOGO_BYTES`), or refused with M-LOGO-2 after three attempts; an SVG over the cap after sanitising is refused; the 65th distinct image is refused with M-LOGO-3 while re-using one of the 64 is accepted |
| P2-13 | `serializer-v2.test.mjs` (new) | **Shape:** the output equals 07 §4.2's skeleton minus the absent keys of §4.6, in 07's key order: `version` `"2.0"` first, then `format`; snake_case keys; v1 keys verbatim (a v1 reader ignoring unknown keys reads the same wall); no `nextSectionId`, `schemaVersion`, `schemaRevision`, `savedAt` or `wall` wrapper. **Round trip:** `read(write(project))` reproduces sections, mesh mode, display, panel-ID style, camera (including `posY = 0` and a gizmo-made `posZ = −2`, valid from P2-13e because the v2 rule is 07's ±100,000 m and the restore uses `assign`), props and logos (one asset per distinct image; `assets[].id` = `'a_' + sha256` prefix). **Fidelity (07 §4.7):** for every file the app writes, `validateProject` raises no issue and `write(read(file))` is byte-identical; this includes a cap-sized BMP upload stored as a downscaled PNG. **Forward compatibility:** a 07 v2.0 file with `project` and `viewport` reads with `dropped-unknown` infos only; `"2.1"` adds a `newer-revision` warning; `"3.0"` is `newer-version`. Every v1 config imports exactly as in P2-3. `core/sha256.js` equals Node's `crypto` for the empty input, `"abc"`, 1 MB and lengths 55, 56, 63, 64, 65 (07 §6.13) |
| P2-13 | `camera-controller.test.mjs` (spies) | `applyImportedPose` emits `CAMERA_POSE_CHANGED{import}` once, refreshes the hub only when enabled, and on a disabled camera makes the next `setPreviewEnabled(true)` skip `resetPose()` exactly once; `PropController.applyImportedPose` emits `PROP_POSE_CHANGED{import}`. `ProjectIO` emits neither (spy on the bus) |
| P2-13 | `dom.test.mjs` | `flipToggle` toggles `active` and `aria-checked` together and returns the new state; `setToggle` is idempotent |

### 8.5 Golden outputs that change: master list

Abbreviations:
- **CFG7** = `default, flat3, concave_offsets, convex, mixed, box_corner, large_wall`.
- **MULTI5** = CFG7 minus the single-section `default` and `convex`.
- `<m>` = `combined | section | panel`.
- `OBJ(s,m)` = `s/<m>__export-obj__led-wall-config.obj`, and likewise `MTL`, `GLTF`.
- `ZIP(s)` = `s/final__export-zip__led-wall-export.zip` (the entries are named).

The per-commit lists are in each batch card (§10). They were derived from the output inventory of the current baseline (`tests/regression/output/baseline`, 19 scenarios) plus the eight `p2_*` scenarios, by the grep method of §8.2. Where every output of a kind changes, the manifest uses a segment-agnostic, filename-agnostic pattern with `"each": true` (for example `**/*__export-obj__*.obj` or `**/*combined__export-*`), so a new scenario or a Feature 6 file rename cannot make it stale. Explicit names in the cards are re-checked against the parent's baseline listing before each commit (R10); step 3 of the gate catches anything still missed.

**Where the gate records what (inventory facts the manifests rely on).**
- `camera-preview-info` and `camera-preview-res` are recorded in every `cameraState()`: `camera/cam_00…cam_15`, `gizmo_drag/camera_0{1,2}_*`, `pilot_look/look_0{0,1,3}_*`, `preview_off_in_pilot/pilot_0{0…5}_*`, `preview_resize/resize_02_custom_100x10`, `import_edge/i_empty_state`; and as text in `ui_visual/*.text.json` (00 and 02 hold the initial markup, 04–08 the live labels). `cam_00_disabled` holds the initial markup too.
- `#camera-preview-canvas` and `#camera-preview-res` rects are recorded in `ui_visual/{04..08}_*.styles.json`; the "Z Distance from Wall (m)" label in all seven `ui_visual/*.text.json`.
- Non-empty `console.json` today: `camera` (B-M1 ReferenceError), `import_edge` (three TypeErrors: Add Section, Export OBJ, Export glTF on the empty wall), `large_wall` (B-H3 RangeError). Non-empty `dialogs.json`: `import_edge`, `keyboard`, `preview_off_in_pilot`. `p2_oversize_canvas` adds the B-L4 TypeError of Export Panel IDs.
- Standalone MTLs with `map_Kd` today: every `*section__export-obj__*.mtl` (the seven configs and `import_edge/ii_section`), plus the section-mode exports of `p2_xss_names` and `p2_zip_section_mode`.

### 8.6 Manual checks (not automatable)

| Batch | Check |
|---|---|
| P2-1, P2-2, P2-7 | Khronos glTF-Validator (web page): `concave_offsets` in all three modes, `large_wall` combined, and the synthetic 70,000-vertex export written by the P2-1 unit test into the git-ignored `tests/unit/out/`. Report attached to the pull request: 0 errors |
| P2-2 | Import the exported OBJ and glTF of `concave_offsets` and `box_corner` into Blender 4.x (face-orientation overlay all blue from the stage side, smooth shading on curves). Load the glTF in three.js `GLTFLoader` with a single-sided `MeshStandardMaterial` |
| P2-5 | `p2_curved_safe_distance` screenshots: the `concave30` band fans to near the centre with no fold; the `box_corner` band narrows at the two concave corners and its outer edge is amber there; the documented overlap is visible |
| P2-7 | Open the ZIP of `mixed` (combined) in Blender: the OBJ picks up `textures/panel-ids.png` through the MTL and every panel label sits inside its panel |
| P2-9 | WASD/QE at 60 Hz and 144 Hz (same speed). Pilot: look up and press W, and the camera rises. Rotate gizmo follows the drag in world and local space, including world X/Z rings on a camera with `rotY ≠ 0` |
| P2-10 | Preview window for every filmback preset, plus custom 100×1 and 1×100 (letterboxed, window within its clamps) |
| P2-13 | Keyboard-only walk through every toggle. Screen reader announces "switch, on/off". Safari: a sanitised SVG logo on Export Panel IDs (no SecurityError). Upload an AVIF photo of about 1.5 MB: it is stored as a PNG of at most 2 MB, survives Export JSON → Import JSON without a correction, and still looks right on the panel-ID canvas |

---

## 9. Acceptance criteria

**P2-0**
1. `compare.mjs --expect` exits 1 when an output outside the manifest differs, when an `expect` entry does not differ, and when the only "difference" of an `expect` entry is a within-tolerance PASS. It exits 0 otherwise. Unit-tested with two synthetic output trees.
2. The eight `p2_*` scenarios run green twice in a row against the P2-0 commit (self-consistency): `compare.mjs --expect` with an empty manifest exits 0, and every remaining difference is a `JITTER` entry of `_nondeterminism.json` within its bounds. The allowlist contains the README's outputs and nothing without self-consistency evidence.
3. The oracle tests pass using `LegacyProfiles`; the static checks are green; `tools/check-orientation.mjs` and `tools/check-gltf.mjs` pass their unit tests (including the `Math.fround` min/max rule); `p2_project_v2/network.json` exists and is the only `network.json` in the output tree.

**P2-1**
4. `large_wall` Export glTF in panel mode downloads a file; `large_wall/console.json` contains no `RangeError`.
5. For every pre-existing glTF output, the base64 payload is byte-identical to the baseline.
6. `p2_oversize_canvas`: Export Panel IDs shows M-EXP-2 and throws no exception (`console.json` has no exception). Export ZIP downloads a ZIP without the oversize texture, its JSON `texture_file` is `null`, its MTL has no `map_Kd` for that section, and M-EXP-4 names it. With panel IDs on, the viewport shows the section colour (screenshot). The once-per-rebuild warning is checked by the unit-test spy (§8.4), because the harness does not record warnings. An oversize panel canvas in panel mode falls back the same way (unit test).
7. A synthetic 70,000-vertex combined export passes `tools/check-gltf.mjs` and the Khronos glTF-Validator: no errors, indices of type 5125. Grids of 65,535 and 65,536 vertices use Uint16 and Uint32 respectively, in glTF and in the viewport.

**P2-2**
8. P2-2a and P2-2b produce zero harness differences, except an optional WARN on `toggles/01_wireframe.screenshot.png` (declared `mayChange`, §6.4).
9. Per quad, the new triangles are the legacy triangles with reversed orientation (unit test, §8.4).
10. For every OBJ/glTF output of the harness, `tools/check-orientation.mjs` passes: every triangle's geometric normal has a positive dot product with the vertex normals it references.
11. Curved sections' OBJ `vn` values equal the bisector formula of §6.4 within 1e-6. Flat sections write the `'right-panel'` normals verbatim (01 CR-1): `vn 0.000000 0.000000 1.000000` at heading 0, and `toFixed(6)` of `(−sin a, 0, cos a)` at heading `a` on every vertex, including `large_wall` L3 at 40°. Every OBJ carries the CR-3 orientation header line.
12. glTF outputs contain a `NORMAL` accessor per primitive. `tools/check-gltf.mjs` and the Khronos glTF-Validator report no errors on `concave_offsets` in all modes.

**P2-3**
13. `p2_xss_names`: `xss_probe` and `xss_probe2` are `false`, and the card text shows the literal `<b id="xss-probe">B</b>`.
14. A name containing `"` survives a re-render unchanged.
15. `import_edge` shows the documented messages and no uncaught exception: (i) `sections: []` → M-IMP-2, the previous wall remains and Add Section works; (ii) string numbers → M-IMP-5 with `coerced` lines; (iii) `"weird"` → M-IMP-5 `Mesh mode: "weird" → "combined"`; (iv) duplicate ids → ids `[1, 4, 2, 3]` with one `reassigned-id` line; (v) `'abc'` → id 0; (vi) `{foo: 1}` → M-IMP-1; (vii) `null` → M-IMP-4a; (viii) malformed JSON → the legacy `Error parsing JSON file: …` text.
16. Every CFG7 import yields zero warnings (only the `migrated` info) and an identical harness output. A 200-section wall built with Add Section exports and re-imports with zero warnings; Add Section then shows M-SEC-1. Every value the UI rules can produce (P2-8a, merged first) passes the validator unchanged (property test).
17. A renamed section crossing 4K shows ⚠ in its title (`ui_sections/ui_09`).
18. After an import, `#section-logos-container` lists the imported sections and no logos (when panel IDs are on).

**P2-4**
19. `preview_off_in_pilot`: no alert. Afterwards `#gizmo-pilot` and `#pilot-info` are not active or visible, and an orbit drag moves the camera.
20. `camera/14_preview_off.screenshot.png` shows no safe-distance floor. Re-enabling the preview with safe distance still on shows it again (`cam_15`).

**P2-5**
21. Export Safe Distance OBJ downloads `safe-distance-floor.obj` with no console error, from P2-5a on, before any other export is wrapped by P2-1a.
22. Every face of that OBJ has a +Y geometric normal, and the file contains `vn` lines.
23. `p2_curved_safe_distance`: on all four walls every band triangle is +Y with positive area. On `concave30` no safe vertex lies farther than the circumradius from the centre of curvature; on `box_corner` the corner offsets are clamped to 0.499 m and drawn amber; on `concave_offsets` exactly three offset vertices are clamped; on `convex` there are no gaps. Every OBJ with clamped vertices carries the `# Clamped:` header line; the flat `camera` OBJ does not. The overlap between non-adjacent segments on `box_corner` is documented (§6.9), not tested away.

**P2-6**
24. The ZIP JSON of `box_corner` includes `angle_offset_degrees` 0/90/90/−90, and `box_corner/zipjson_roundtrip__export-json` equals `box_corner/final__export-json` except for `texture_file` (in v1 from P2-6a, and still in v2 from P2-13e, where both are written by the same serializer).
25. In every ZIP, each MTL `map_Kd` path names an existing ZIP entry, and the JSON `texture_file` values are unique. From P2-7f every ZIP contains `textures/panel-ids.png` (unless skipped and reported), and only combined-mode MTLs reference it.
26. Standalone section-mode MTLs contain no `map_Kd`. ARCHITECTURE §8.4 records the residual blocked-second-download observation.

**P2-7**
27. `mixed/panel_ids_combined`: every panel label is fully visible and unsquashed (review), and the atlas sampled at each section's `(u, v_max)` is the section's top edge (unit).
28. For equal-height walls, every viewport screenshot is identical and the combined OBJ `vt` of single-section walls is byte-identical.
29. glTF `TEXCOORD_0` exists on every primitive; the combined UVs are read from `mesh.gltf.combinedUV`. Loaded into three.js with `panel-ids.png`, the labels appear upright (V flip verified).
30. Combined OBJ/glTF carry one material `Wall_<i+1>` / `Wall_<i+1>_Material` per section with that section's colour, and no `LED_Wall_Combined` material remains.
31. The combined LED sim shows section colours (`toggles/03`, `04_*`).

**P2-8**
32. `p2_zero_inputs`: camera Y stays `0`, camera Z becomes `0.1` (and `0` after P2-11c), width becomes `50`, and Columns `2.5` becomes `3` (the input shows `3`).
33. The four integer inputs carry `step="1"`; panel height and LED inputs carry the 07 caps (`max="100000"`, `max="65536"`) and the curve input `min="-180" max="180"`, all present before P2-3b merges. One mesh-mode click causes exactly one rebuild (spy test). Pilot flight stops at y = 0, and no gizmo or pilot write clamps Z (only the ±100,000 m far bound from P2-13e).

**P2-9**
34. An orbit drag that starts on empty canvas with the person selected keeps the selection. A click of under 4 px on empty canvas deselects it.
35. `p2_shortcut_filters`: `g` in a focused select, Ctrl+G and auto-repeated `p` change no gizmo or pilot state. Clicking Front in pilot mode exits pilot mode and shows the front view.
36. `gizmo_drag`: a counter-clockwise drag on the Y ring increases `rotY`. Prop gizmos show only the X/Z arrows and the Y ring.
37. Manual: pilot W while looking up raises the camera, and movement speed is the same at 60 Hz and 144 Hz.

**P2-10**
38. With every preset, the preview image rect has the filmback aspect within 1% (`letterboxRect`), the canvas equals the window's inner box, and the window stays within 200–800 × 120–600 px for custom 100×1 and 1×100 filmbacks. No helper (grid, axes, rig, gizmo, floor) and no orange tint appears in the preview.
39. The preview header reads `35mm • ARRI LF` for `arri-lf` and `35mm • Full Frame` for the default, and the footer shows the drawn image size (`264×176 px` for the default window and Full Frame at a device pixel ratio of 1). A resize drag at Full Frame still gives the legacy 800×533 at the width limit; the `preview_resize` 100×10 drag gives 520×120.

**P2-11**
40. Every unrotated coverage state (`camera` `cam_00…cam_07`, `cam_09b`, `cam_09c`, `cam_11…cam_15`; `gizmo_drag/camera_01_translated`; `pilot_look/look_00_pilot_on`; every `preview_off_in_pilot` state) is byte-identical to the previous baseline; only the rotated states listed in §6.10 change. From the reset pose with pan 90°, the status is `Not aimed at wall`. A camera behind the wall facing it reports `Not aimed at wall` with `—`.
41. For every corner ray that hits the wall, the far vertex of the frustum lines **and** of the semi-transparent fill is the hit point (within 1e-6 m; unit test with the camera-space depth of §6.10), so neither pokes through the wall; corners without a hit use `D0`, else 15 m.
42. The safe distance and the status use the same rotation-invariant width: a single flat section with a 90° offset gets the same `D` as with 0°.
43. Reset on any wall puts the camera in front of the wall's chord, looking at its centre, with `rotY` in (−180, 180] (180 for a 180°-offset section); Camera Z accepts 0 and negative values; the input, the gizmo and pilot apply the same position rules.

**P2-12**
44. After 100 colour-picker `input` events in panel mode with panel IDs on, `renderer.info.memory.textures` returns to its pre-drag value ±2 (devtools probe).
45. Panel mode with panel IDs shows the section logos and the section-label size, matching section mode (`toggles/09`, review). Panel mode with LED sim is unchanged (`toggles/06_ledsim_panel` identical).
46. A gizmo drag of the camera changes no safe-distance object (same object ids), and at every step both frustum geometries (lines and fill) end at the wall: `updateFrustumDepths` rewrote all 24 far-corner slots (spy on `setXYZ`).
47. With panel IDs on in panel mode, the number of panel-ID textures equals the number of sections (devtools probe).

**P2-13**
48. `p2_project_v2`: the exported file has 07 §4.2's shape (`"version": "2.0"` first, `format`, snake_case, v1 keys verbatim, logos in `assets[]`, no `nextSectionId`); the v2 round trip restores the camera (pose, lens, enabled), props, display toggles, panel-ID style and **both logos** (the PNG and the downscaled BMP) exactly, with no correction; the second JSON export is byte-identical to the first. Step 7: after importing a file saved with the preview off and then turning the preview on, the camera has the saved pose. v1 files import as before.
49. `p2_project_v2` step 8: the `https://`, `data:text/html` and malformed-base64 logos are dropped and listed in M-IMP-5, `network.json` is empty, the stored SVG contains no `foreignObject`, `script` or external `href`, and Export Panel IDs and Export All (ZIP) still succeed.
50. A 0×0 SVG logo with a `viewBox` renders on the panel-ID canvas. A corrupt image shows M-LOGO-1; a 3 MB image shows M-LOGO-2; a converted image is stored at most 2 MB (downscaled if needed); a 65th distinct logo image shows M-LOGO-3.
51. Every toggle is reachable with Tab and switchable with Space/Enter, and `aria-checked` equals its `.active` state after every step of `p2_project_v2`, including the forced-off LED-sim / panel-ID pair.
52. `LEGACY_SITES` contains only the rows handed to feature specs (`PanelIdRenderer.js#panelCanvas` with the B-L19 id only, for 04 UV-9; the B-L24 documentation rows until F1/F6 land) and any id the owner explicitly keeps. B-M16 appears in no tag. `Strategies` no longer exists, and `tests/static/check.mjs` (with the rewritten rule 8) is green.

---

## 10. Task breakdown: batch cards

Each card lists, per commit: the switch or site, the `LEGACY_SITES` rows removed (ARCHITECTURE §8.3), the harness outputs in the expected manifest, the effort, the risk and what it unblocks. Cards follow the **merge order** of the §1 table, except that the P2-9, P2-12 and P2-13 cards each hold commits that merge in two different blocks (stated in each card). Manifests list `expect` entries; `mayChange` entries are marked. Every manifest was derived from the output inventory by the grep method of §8.2 and uses the abbreviations below; `_nondeterminism.json` applies to every commit and is never repeated here.

**Abbreviations.**
- **CFG7** = `{default,flat3,concave_offsets,convex,mixed,box_corner,large_wall}`; **MULTI5** = `{flat3,concave_offsets,mixed,box_corner,large_wall}` (CFG7 without the single-section `default` and `convex`).
- **ALLZIP** = `**/*__export-zip__*.zip`: every ZIP of every scenario.
- **COMBZIP** = `CFG7/final__export-zip__*.zip`, `logos/*__export-zip__*.zip`, `**/*combined__export-zip__*.zip`: every ZIP exported in combined mode. Every ZIP of today's baseline is combined (verified: none of their MTLs has `map_Kd`, and every OBJ header says `combined`); the `p2_*` scenarios add the section-mode ZIPs of `p2_xss_names`, `p2_zip_section_mode` and `p2_oversize_canvas` and the combined ZIP of `p2_project_v2` step 8.
- **PREVIEW_SHOTS** = every screenshot taken while the camera preview window is shown: `camera/{01_camera_enabled,08_camera_moved,13_safe_distance}`, `gizmo_drag/camera_0{1_translated,2_rotated}`, `pilot_look/look_0{1_after_drag,2_after_wheel,3_pilot_off}`, `preview_off_in_pilot/pilot_0{0_on,5_exited}`, `preview_resize/resize_0{1_dragged,3_blow_out}`, `keyboard/{pilot_view,final_view}`, `import_edge/i_empty`, `p2_curved_safe_distance/*`, `p2_shortcut_filters/*`, `p2_project_v2/*` (all `.screenshot.png`).
- **CAMSTATE** = every recorded `cameraState()` taken after the preview was first enabled (§8.5): `camera/cam_{01…15}*.json`, `gizmo_drag/camera_0{1,2}_*.json`, `pilot_look/look_0{0,1,3}_*.json`, `preview_off_in_pilot/pilot_0{0…5}_*.json`, `preview_resize/resize_02_custom_100x10.json`, `import_edge/i_empty_state.json`, and the camera states of `p2_zero_inputs` and `p2_project_v2`.

### P2-0 · Phase 2 enablement (L, 4 d · risk Low · depends on: Phase 1 merged)

| Task | Effort |
|---|---|
| T0.1 `compare.mjs --expect` (§8.2 semantics: `each`, `{a,b}`, PASS does not satisfy), `JITTER` and the auto-loaded `expected/_nondeterminism.json`, + unit tests + README "Phase 2 re-baselining" section | M (1 d) |
| T0.2 `LegacyProfiles` + re-point the oracle tests | S (0.5 d) |
| T0.3 `scenarios-phase2.mjs` (8 scenarios, §8.3: inline payloads, the generated noise BMP, the `<mode>__<button>` label convention) + registration | M (1.5 d) |
| T0.4 Opt-in request log (`recordRequests`, `network.json`) in `lib/app.mjs` and `lib/recorder.mjs` | S (0.25 d) |
| T0.5 `tools/check-orientation.mjs`, `tools/check-gltf.mjs` (with the `Math.fround` min/max rule) + unit tests | S (0.5 d) |
| T0.6 Two full self-consistency runs of the P2-0 build; build `_nondeterminism.json` from the README list plus the measured evidence | S (0.25 d) |
| T0.7 ARCHITECTURE §10 / REFACTOR_PLAN §6 amendments (baseline = parent; one procedure for all specs; the allowlist rule); **REFACTOR_PLAN §5's Phase 2 list rewritten to this roadmap's merge order and batch membership** (§1 table, §5.5) | S (in the commit) |

- **Manifest:** `p2_*/**` (added; the eight new scenarios, including `p2_project_v2/network.json`). Every existing output is unchanged.
- **Unblocks:** every later batch, and the rest of the harness-only PR series (01 T2 → 07 G3 → G4 → G6, §8.2).

### P2-5a · Safe-distance OBJ downloads: B-M1 (S, 0.5 d · risk Low · depends on: P2-0; merged before P2-1a)

| Commit | Switch / site | Rows removed | Expected manifest |
|---|---|---|---|
| P2-5a B-M1 | `downloader.saveBlob`; `legacyMissingDownloadBlob` deleted. The legacy per-column band geometry is kept until P2-5b (release note: "faces point down until the next update") | `LegacyCompat.js#legacyMissingDownloadBlob`, `ProjectIO.js#exportSafeDistanceOBJ` | `camera/export-safe-distance__*.obj` (added), `camera/{downloads,console}.json` (each); `p2_curved_safe_distance/*__export-safe-distance__*.obj` (added, each), `p2_curved_safe_distance/{downloads,console}.json` (each) |

### P2-1 · Exports never fail silently: B-H3, B-L5, B-L4 (M, 2 d · risk Low · depends on: P2-5a)

| Commit | Switch / site | `LEGACY_SITES` rows removed | Expected manifest | Effort |
|---|---|---|---|---|
| P2-1a B-H3 | `Strategies.gltfBase64` retired. `chunkedBase64` becomes the encoder. `ProjectIO.#runExport` wraps all exports; deferred `revokeObjectURL` | `LegacyCompat.js#legacySpreadBase64` (B-H3); the B-H3 id from `GltfExporter.js#write` and `ProjectIO.js#exportZIP` | `large_wall/panel__export-gltf__*.gltf` (added); `large_wall/{downloads,console}.json` (each); **`import_edge/{console,dialogs,i_dialogs}.json`** (each: the empty-wall Export OBJ and Export glTF TypeErrors become M-EXP-1 alerts; the Add Section TypeError stays, because Add Section is not an export); **`p2_oversize_canvas/{console,dialogs}.json`** (each: the Export Panel IDs TypeError becomes an M-EXP-1 alert). The `camera` and `p2_curved_safe_distance` exports no longer throw (P2-5a), so they are unaffected | S |
| P2-1b B-L5 (glTF) | `mesh.gltf.indexType: 'uint16' → 'auto'`; `indexWidth` with `>= 65535` (§6.2) | the B-L5 id from `GltfExporter.js#addMesh` | empty (unit tests at 65,535 / 65,536 vertices) | S |
| P2-1c B-L4 (exports) | Size guards in `ProjectIO.exportPanelIds/exportZIP` (pre-check, null names, late re-write, §6.3); `TextureAtlas.canvasFits`; `PanelIdRenderer.atlasSize/sectionSize/panelSize`; `skipped[]` threaded into the OBJ writer (no `map_Kd`) and the ZIP JSON (`texture_file: null`) | `ProjectIO.js#exportPanelIds` (B-L4); the B-L4 id from `ProjectIO.js#exportZIP` | `p2_oversize_canvas/dialogs.json` (M-EXP-1 becomes M-EXP-2, plus M-EXP-4), `p2_oversize_canvas/*__export-zip__*.zip` (the 0-byte PNG entry is gone; JSON `texture_file: null`). `console.json` is not expected to change: the error was already caught in P2-1a, and warnings are not recorded (§2.4) | M |
| P2-1d B-L4 (viewport) | `atlasCanvas`/`sectionCanvas`/`panelCanvas` return `null` when they do not fit; colour fallback + console warning | none (the viewport half had no tag; ARCHITECTURE §8.2 B-L4 row closed) | `p2_oversize_canvas/panel_ids_viewport.screenshot.png`. The warning is checked by the unit-test spy, not by the harness | S |
| P2-1e B-L5 (viewport) | `LEDWallView` passes a `Uint32BufferAttribute` when `indexWidth` says `'uint32'` | none (no tag; §2.2 observation) | empty (no harness wall reaches 65,535 vertices; unit test) | S |

- **User-visible effect:** big walls export; the remaining failures are explained; the viewport never shows a blank panel-ID texture.
- **Unblocks:** P2-2 and P2-7 (buffer growth), F1 T1 (exports with normals), F4 (glTF UVs).

### P2-2 · Stage-facing winding and real normals: B-H1, B-H2, B-L3 (M, 2 d · risk Med · depends on: P2-1)

| Commit | Switch / site | Rows removed | Expected manifest | Effort |
|---|---|---|---|---|
| P2-2a B-H1 | `mesh.viewport.winding → 'ccw'` (`quadIndices` case `'ccw'`) | the B-H1 id from `WallMeshBuilder.js#quadIndices` (B-H2 stays until 2d); `LEDMaterialFactory.js#side` (B-H1; `'double'` stays as a design choice) | **expect empty** (invariance); `mayChange`: `toggles/01_wireframe.screenshot.png` (line direction, §6.4) | S |
| P2-2b B-L3 | `mesh.viewport.normals → 'averaged'` (with the 01 CR-1 flat short-circuit) | the B-L3 id from `WallMeshBuilder.js#sectionGrid` | **empty** | S |
| P2-2c B-H2 (OBJ) | `mesh.obj.winding → 'ccw'`, `.normals → 'averaged'`, `.stripNormals → 'per-vertex'`; the 01 CR-3 header line | the B-H2 id from `ObjExporter.js#write` | `**/*__export-obj__*.obj` (each), ALLZIP (each; entry `led-wall-config.obj`). This covers 01 CR-2 (`import_edge`, `logos`, `ui_sections`) by construction | M |
| P2-2d B-H2 (glTF) | `mesh.gltf.winding → 'ccw'`, `.normals → 'averaged'`, `+ panelNormal: 'facing'`, `.attributes → ['POSITION','NORMAL']`; add a `doubleSided` case `'true'` (unused) | the B-H2 id from `GltfExporter.js#addMesh`; the rest of `WallMeshBuilder.js#quadIndices` (the `legacy-cw` case stays for `LegacyProfiles`, with an untagged comment) | `**/*__export-gltf__*.gltf` (each), ALLZIP (each; entry `led-wall-config.gltf`) | M |

- **User-visible effect:** see §0 row 1. MTL, JSON, PNG and every screenshot stay identical (except the possible wireframe WARN).
- **Unblocks:**
  - F1, whose debug view needs correct normals: the core of "normals flipped by default". F1 adds the normals view and the per-section LED side (01 is amended per §5.6).
  - F5 (soft): lit and env-mapped materials need correct normals.

### P2-8a · Integer counts and sanity caps: B-L15 (S, 0.5 d · risk Low · depends on: P2-0; merged before P2-3b)

| Commit | Site | Rows removed | Expected manifest |
|---|---|---|---|
| P2-8a B-L15 | `domain/rules.js` created (`clamp`, `roundInt`, `deepFreeze`); `WallSection.LIMITS` (07 §4.3 values); `FIELD_RULES` rounding and caps (height ≤ 100,000 mm, LEDs ≤ 65,536, curve ±180°); template `step="1"` on the four integer inputs, `max` on height and LEDs, `min`/`max` on curve | `WallSection.js#FIELD_RULES`, the B-L15 id from `WallMeshBuilder.js#sectionGrid` | every section snapshot that records input attributes (found by grepping the baseline for `"max"`): `CFG7/sections_initial.json` (each), `ui_sections/ui_*.json` (each, 16), `import_edge/{ii_strings_state,iv_after_import,iv_after_delete,v_after_import,v_after_add,vi_before,vi_after,vii_after,viii_after}.json` (each), `p2_xss_names/sections_*.json` (each), `p2_zero_inputs/*` (Columns 2.5 → 3) |

### P2-3 · Safe import and HTML: B-M4, B-L8, B-L16, B-L21 (L, 4 d · risk Med · depends on: P2-8a)

| Commit | Switch / site | Rows removed | Expected manifest | Effort |
|---|---|---|---|---|
| P2-3a B-M4 (= 07 D7) | `escapeHtml` everywhere; `legacyHtml` deleted | `LegacyCompat.js#legacyHtml`, `SectionListPanel.js#render` (B-M4), the B-M4 id from `SectionLogosPanel.js#render` and `ProjectSerializer.js#read` | `p2_xss_names/{sections_*,xss_probe*}.json` | M |
| P2-3b B-L8 (07 D2/D3, wall subset) | `ProjectValidator`, `ProjectMigrations`, `ProjectSchema` with 07's signatures, issue shape, codes and dispatch (§4.3); `Strategies.importValidation` retired; explicit mode dispatch; `Wall.MAX_SECTIONS` (200) + `WallController.addSection` (M-SEC-1); `MAX_IMPORT_BYTES` and `reader.onerror` (M-IMP-6, M-IMP-7); `WallSection.setName` sanitising | the B-L8 rows at `WallSection.js#constructor`, `Wall.js#appendLikeLast`, `Wall.js#replaceAll`, `LogoLibrary.js#get`, `ProjectSerializer.js#read`, `SectionLogosPanel.js#render`, `LEDWallView.js#rebuild`, `ObjExporter.js#write`, `GltfExporter.js#write`, `WallMeshBuilder.js#sectionGrid` | `import_edge/*` (the reviewer checks each case against criterion 15: (i) the wall survives, so `i_*` states, `i_empty.screenshot.png`, and the now-successful `i__export-{obj,gltf}` downloads change; (ii)–(v) states, exports and dialogs; (vi) and (vii) dialogs); `p2_xss_names/{dialogs,sections_*}.json` (the CSS-injection colour is corrected); `p2_project_v2` step-8 outputs (the inline v2 file is refused with M-IMP-4b until P2-13e) | L (2.5 d) |
| P2-3c B-L16 | `setTitleWithWarning` in `#patchCard` | `SectionListPanel.js#patchCard` | `ui_sections/ui_09_card1_4k_warning.json`, `ui_sections/ui_10_card0_4k_warning.json` | S |
| P2-3d B-L21 | `WallController.applyImport({sections, meshMode, logos = null})` clears the library first and installs only the logos it is given; the logo panel renders on import | `WallController.js#applyImport`, `SectionLogosPanel.js#constructor` | `p2_xss_names` logo list. `logos/*` is unchanged: that scenario never imports | S |

- **User-visible effect:** see §0 row 2 and §3.2.
- **Unblocks:** F1 T9, F2 (validated, unique ids), F3 T7, F6 T8 (`migrateV1toV2` with the legacy palette fill); the v2 path of P2-13e reuses all three modules.

### P2-4 · Clean preview-off: B-H4, B-M8 (S, 0.5 d · risk Low · depends on: P2-0)

| Commit | Site | Rows removed | Expected manifest |
|---|---|---|---|
| P2-4a B-H4 | `PilotController.toggle` guard on entry only (+ null `bodyMesh` on `remove`) | `PilotController.js#toggle` (B-H4 id; B-L26 stays), `CameraController.js#setPreviewEnabled` (B-H4 id) | `preview_off_in_pilot/*` (dialogs, gizmo/pilot states, screenshots). `keyboard/dialogs.json` is unchanged: its alert is the entry guard, which stays |
| P2-4b B-M8 | `setPreviewEnabled(false)` → `hub.syncSafeDistance()` | `CameraController.js#setPreviewEnabled` (B-M8) | `camera/14_preview_off.screenshot.png` |

- **Unblocks:** F5 (soft; previs sessions toggle the preview freely).

### P2-5b · Mitred, clamped safe-distance band: B-L29, B-M15 (M, 2 d · risk Low–Med · depends on: P2-5a)

| Commit | Switch / site | Rows removed | Expected manifest |
|---|---|---|---|
| P2-5b B-L29 + B-M15 | `Strategies.safeDistanceBand` retired; `SafeDistanceBand.js` (mitred, clamped, `'clamped'` tint, §6.9); the OBJ writer adds `vn` and the `# Clamped:` header line | `SafeDistanceView.js#create` (B-M15, B-L29), `WallLayout.js#flatEdges` (B-M15) | `camera/export-safe-distance__*.obj` (shared-vertex strip, +Y faces, `vn`; no `# Clamped:` line on the flat wall), `p2_curved_safe_distance/*.obj` (each), `p2_curved_safe_distance/*.screenshot.png` (each); `mayChange`: `camera/13_safe_distance.screenshot.png` (flat wall, expected identical) |

- **Unblocks:**
  - F1 T9 (σ per section in the band).
  - F2 (soft): the per-floor-run band (02 §6.12) reuses `buildSafeDistanceBand` per run.
  - F3: the band follows the pivot transform through the layout.

### P2-6 · Consistent, lossless bundles: B-M3, B-L14, B-L7, B-M2 (M, 1.5 d · risk Low · depends on: P2-3)

| Commit | Switch / site | Rows removed | Expected manifest |
|---|---|---|---|
| P2-6a B-M3 | `Strategies.zipJsonIncludesAngleOffset` retired; the `'zip'` variant becomes the file literal plus `texture_file` | the B-M3 id from `ProjectSerializer.js#write` | ALLZIP (each; entry `led-wall-config.json`), `box_corner/zipjson_roundtrip__export-json__*.json`, `box_corner/zipjson_import_result.json` |
| P2-6b B-L14 | `PanelNaming.textureFileNames`; `zipTextureNaming` retired | `PanelNaming.js#zipTextureFileName`, the B-L14 id from `ProjectIO.js#exportZIP` | `p2_xss_names/*__export-zip__*.zip` (texture entries + JSON `texture_file`). `p2_zip_section_mode` is unchanged (its names were already unique) |
| P2-6c B-L7 | standalone MTL without `map_Kd`; `mtlDownloadDelayMs` → `ProjectIO.MTL_DOWNLOAD_DELAY_MS`; ARCHITECTURE §8.4 gains the residual blocked-download observation | `ProjectIO.js#exportOBJ` | `**/*section__export-obj__*.mtl` (each): the seven `CFG7/section__…mtl`, `import_edge/ii_section__…mtl`, `p2_xss_names/section__…mtl`, `p2_zip_section_mode/section__…mtl` |
| P2-6d B-M2 | `mtlTextureFile(fileName)`; `mtlTextureNaming` retired | `PanelNaming.js#mtlTextureFile` | `{p2_zip_section_mode,p2_xss_names}/*section__export-zip__*.zip` (each; the `.mtl` entry). No baseline ZIP is in section mode, so nothing else changes |

- **Unblocks:** F4 (the UV viewer, ZIP and MTL agree on texture names), P2-13e (one serializer). F6's filenames stay in `Theme.brand.files` and one naming helper.

### P2-7 · UVs match textures: B-M5, B-M6, B-M7, B-L6, B-L18 (L, 4 d · risk Med · depends on: P2-1, P2-2, P2-6, owner Q4/Q5)

**This roadmap is authoritative for P2-7a–f** (§5.6). 04 withdrew its earlier UV-1..UV-4 and binds, in its §2.3, the decisions these commits implement: pixel-accurate atlas UVs, per-primitive accessors, the `mesh.gltf.combinedUV` leaf, the atlas `'textures/' + Brand.files.panelIdsPng` in every ZIP, and no `map_Kd` in standalone MTLs.

| Commit | Switch / site | Rows removed | Expected manifest |
|---|---|---|---|
| P2-7a B-M5 | `mesh.viewport.combinedUV → 'atlas-pixel-accurate'`; `TextureAtlas.uvHeight` | `WallMeshBuilder.js#combinedGrid` (B-M5), the B-M5 id from `LEDMaterialFactory.js#combined` | `mixed/panel_ids_combined.screenshot.png`, `p2_mixed_content/*.screenshot.png` (each) |
| P2-7b B-M6 | `mesh.obj.combinedUV → 'atlas-pixel-accurate'` | the B-M6 id from `ObjExporter.js#write` | `MULTI5/combined__export-obj__*.obj` (each), `MULTI5/final__export-zip__*.zip` (each; entry `.obj`), `ui_sections/edited__export-obj__*.obj` (combined, multi-section). Single-section combined OBJs (`default`, `convex`, `import_edge/ii_combined`, `iii_weird`, `p2_zero_inputs`, `logos`, `p2_project_v2`) are unchanged (`0 + x·1 === x`) |
| P2-7c B-M7 | `mesh.gltf.attributes → [..., 'TEXCOORD_0']` (v flipped); new leaf `mesh.gltf.combinedUV = 'atlas-pixel-accurate'` | the B-M7 id from `GltfExporter.js#addMesh` | `**/*__export-gltf__*.gltf` (each; covers 04's `import_edge` and `logos` additions), ALLZIP (each; `.gltf`) |
| P2-7d B-L6 | `Strategies.exportCombinedColor` retired; per-section materials and primitives (§6.8) | the B-L6 id from `ObjExporter.js#write` and `GltfExporter.js#write` | `**/*combined__export-{obj,gltf}__*` (each; matches `.obj`, `.mtl` and `.gltf`, including `import_edge/ii_combined__…` and `p2_zero_inputs`), `import_edge/iii_weird__export-{obj,gltf}__*` (each; combined since P2-3b), `ui_sections/edited__export-obj__*` (each; `.obj` and `.mtl`), COMBZIP (each; `.obj`, `.mtl`, `.gltf` entries) |
| P2-7e B-L18 | `Strategies.combinedLedSimColor` retired; the `tile` cache key normalised | the B-L18 id from `LEDMaterialFactory.js#combined` and `LEDPixelTextureFactory.js#tile` | `toggles/03_ledsim_single-dot.screenshot.png`, `toggles/04_ledsim_{rgb-triangle,rgb-stripe,rgb-horizontal,square,single-dot}.screenshot.png`, the two LED-sim screenshots of `p2_mixed_content` |
| P2-7f (Q5, no bug id) | `textures/panel-ids.png` in every ZIP when `canvasFits` passes (guarded, §6.3); each combined `newmtl Wall_<i+1>` in the ZIP gains `map_Kd textures/panel-ids.png` | – | every ZIP whose atlas fits (each; entry list, and `.mtl` for combined ones): `CFG7/final__export-zip__*.zip`, `logos/*__export-zip__*.zip`, `{p2_xss_names,p2_zip_section_mode,p2_project_v2}/*__export-zip__*.zip`; **`p2_oversize_canvas/dialogs.json`** (M-EXP-4 now also lists `textures/panel-ids.png`; its ZIP is unchanged because the atlas is skipped) |

- **Accepted double re-baseline (Q4, R2).** Feature 4 later flips the default to per-section 0..1 (04 UV-7/UV-8a/UV-8b, the `'plan'` case), which changes the combined viewport screenshots of multi-section walls, the combined OBJ `vt` and the glTF `TEXCOORD_0` a second time. This is accepted: P2-7 fixes a visible defect now with one texture, and the atlas layout stays as 04's `atlas` option.
- **Unblocks:**
  - F4: the clean-UV feature then adds `'plan'` and the UV viewer/editor on top of a correct atlas.
  - F5 (soft): baking the projection to textures needs glTF UVs.

### P2-8b–d · Numeric input semantics: B-L9, B-L10 (pilot half), B-L13 (M, 1 d · risk Low · depends on: P2-8a)

| Commit | Site | Rows removed | Expected manifest |
|---|---|---|---|
| P2-8b B-L9 | `domain/rules.js` `finiteOr`; `orDefault` deleted | `LegacyCompat.js#orDefault` | `p2_zero_inputs/*`. No other scenario types a `0` into a field whose legacy default differs (checked: `ui_sections` types rows `0`, which clamps to 1 both ways; `camera` types Y `-3`, which clamps to 0 both ways) |
| P2-8c B-L10 (pilot) | `pilotFly` floor 0 (no Z clamp); `wrapDeg` on gizmo and pilot rotation writes | `CineCamera.js#pilotFly` | `mayChange`: `gizmo_drag/*.json`, `pilot_look/*.json` (no value is expected to cross a limit) |
| P2-8d B-L13 | `setMeshMode` no-op guard | `WallController.js#setMeshMode`, `WallDisplayPanel.js#bind` | empty |

- **Unblocks:** P2-13e (exact round trip of zero values); F3's pivot offset inputs may use `finiteOr`/`clamp` (03 does not depend on it).

### P2-9 · Interaction: B-M14, B-L11 | B-M12, B-L22, B-L23, B-L28 | B-M13, B-L27, B-L25, B-L26 (L, 4 d · risk Med · depends on: P2-8c, owner Q6)

P2-9a–d merge in the feature-gate block; P2-9e–j in the remainder (§1).

| Commit | Switch / site | Rows removed | Expected manifest |
|---|---|---|---|
| P2-9a B-M14 | select on click (`ViewportInput.attachPointer`) | `ViewportInput.js#attachPointer`, `SelectionManager.js#pickAt` | `mayChange`: `gizmo_drag/*` (its picks are zero-travel clicks and its drags start on handles, so no change is expected); `keyboard/*` expected **unchanged** |
| P2-9b B-L11 | shortcut filters; creates `core/typingTarget.js isTypingTarget(t)` with 07 §3.8's truth table (its one named owner, 07 C18/C52; `isShortcutIgnoredTarget` stays as a re-export until 07 I1) | `InputState.js#isShortcutIgnoredTarget`, `ViewportInput.js#attachShortcuts` | `p2_shortcut_filters/*` (steps 1–3) |
| P2-9c B-M12 | `Strategies.gizmoRotateSign` retired | `TransformGizmo.js#onMouseMove` | `gizmo_drag/{person_02_rotated,camera_02_rotated}.json`, `gizmo_drag/{person_02_rotated,camera_02_rotated}.screenshot.png` |
| P2-9d B-L22 | `Selectable.allowedAxes` | `Prop.js#translateBy`, `Prop.js#rotateBy`, the B-L22 id from `TransformGizmo.js#rebuild` | `keyboard/person_selected_translate_gizmo.screenshot.png`, `keyboard/person_rotate_gizmo.screenshot.png`, `gizmo_drag/person_0{1_translated,2_rotated}.screenshot.png`; `mayChange`: `gizmo_drag/person_*.json` |
| P2-9e B-L23 | re-orient on `SELECTABLE_MOVED` in local space | `TransformGizmo.js#updatePosition` | empty (no scenario moves a target in local space; manual check §8.6) |
| P2-9f B-L28 | quaternion composition (`eulerYXZ.js`) | `CineCamera.js#rotateBy` | **empty**: `gizmo_drag` rotates only the Y ring at rotX = rotZ = 0, where the composition equals the Euler sum (§6.12); proved by unit tests |
| P2-9g B-M13 | `Strategies.pilotForwardYSign` retired | the B-M13 id from `PilotController.js#tickKeyboard` | empty (manual check) |
| P2-9h B-L27 | `dt` time step | `OrbitController.js#tickKeyboard`, the B-L27 id from `PilotController.js#tickKeyboard` | empty (no scenario holds a movement key; manual check) |
| P2-9i B-L25 | a preset in pilot mode exits pilot first (07 §3.7) | `OrbitController.js#setView` | `p2_shortcut_filters/*` (step 4) |
| P2-9j B-L26 | gizmo hidden in pilot (`PILOT_CHANGED` mirror) | `PilotController.js#toggle` (B-L26), the B-L26 id from `TransformGizmo.js#rebuild` | `mayChange`: `keyboard/pilot_view.screenshot.png` (only if the gizmo was visible there; expected unchanged) |

- **Unblocks:**
  - F2: section picking on click (B-M14), the typing guard (B-L11) and correct rotation (B-M12) are hard gates of 02; per-target axes (B-L22) are soft.
  - F4: the shortcut guard covers the UV editor's inputs.
  - F3 and F5 (soft): marker and projection-point drags (both later move to 07 I3).

### P2-10 · Preview window: B-M11, B-M9, B-L32, B-L34 (M, 2 d · risk Low–Med · depends on: P2-4)

If 07 R1/R2 have landed first, P2-10a/b are dropped (R1/R2 retire the same keys) and P2-10c moves into `PreviewPass` (§5.6).

| Commit | Switch / site | Rows removed | Expected manifest |
|---|---|---|---|
| P2-10a B-M11 | `Strategies.previewRendersHelpers` retired; helpers hidden during the preview render | `PreviewWindow.js#render`, `SceneManager.js#addHelper` | PREVIEW_SHOTS (each; the preview image loses the grid, rig and the orange frustum tint) |
| P2-10b B-M9 + B-L32 | `Strategies.previewRendererSize` retired; inner-box canvas, per-axis clamps after the legacy width clamp, letterbox (§6.14) | `PreviewWindow.js#init`, `PreviewWindow.js#setupResize` | PREVIEW_SHOTS (each); `preview_resize/resize_0{0_initial,1_dragged,2_custom_100x10,3_blow_out}.json` (each: the canvas entry becomes the inner box, 316×176 and 416×276; `resize_03` becomes 520×120 instead of 1200×120; the window sizes of 00–02 are unchanged); `ui_visual/{04..08}_*.styles.json` (each: `camera-window/canvas` rect 320×180 → 316×176); `mayChange`: `ui_visual/{04..08}_*.viewport.screenshot.png` |
| P2-10c B-L34 | `shortName`; drawn-size footer | `CineCamera.js#presetShortName`, `PreviewWindow.js#updateCamera` | CAMSTATE (each: the footer becomes the drawn size, and "Full"/"ARRI" become "Full Frame"/"ARRI LF"; `cam_00_disabled` keeps the initial markup and is unchanged); `ui_visual/{04..08}_*.text.json` (each; 00 and 02 hold the initial markup and are unchanged); PREVIEW_SHOTS (each; the footer text is drawn over the canvas); `mayChange`: `ui_visual/{04..08}_*.styles.json` (label widths), `ui_visual/{04..08}_*.viewport.screenshot.png` |
| P2-10d (optional, §2.2) | pilot `camera.aspect` from the filmback | – | `keyboard/pilot_view.screenshot.png`, `pilot_look/look_0{1,2}_*.screenshot.png`, `p2_shortcut_filters/*.screenshot.png`; `mayChange`: `ui_visual/05_gizmo_pilot.viewport.screenshot.png` (masked) |

- **Unblocks:** F3 step C (marker visible by default needs B-M11). F5's preview is 07 R1/R2's single renderer, which keeps this window geometry (§5.6).

### P2-11 · True framing and coverage: B-M10, B-L33, B-L2, B-L10 Z half (L, 3.5 d · risk Med · co-scheduled with Feature 3)

| Commit | Switch / site | Rows removed | Expected manifest |
|---|---|---|---|
| P2-11a B-M10 | `FrustumCoverage.analyzeCoverage` over the memoised `layout.columnQuads()` (rays + projected-quad overlap); `WallLayout.worldVertices/columnQuads/extentAcross`; `CineCamera.coverage` deleted; `offWall` status | `CineCamera.js#coverage` | the rotated states of §6.10 (each): `camera/cam_{08_rotation,09_far,10_clamps}.json` (`cam_10` becomes `offWall` with `—`), `gizmo_drag/camera_02_rotated.json`, `pilot_look/look_0{1_after_drag,3_pilot_off}.json`, and the rotated camera states of `p2_project_v2`. Every unrotated state must stay identical (criterion 40); `mayChange`: `ui_visual/{04..08}_*.text.json` (coverage readouts, if the camera there is rotated) |
| P2-11b B-L33 | per-corner frustum depth in camera-space units, for the lines and the fill (§6.10); `frustumDepthM` retired | `CameraRigView.js#rebuildFrustum` | `camera/{01_camera_enabled,08_camera_moved,13_safe_distance}.screenshot.png`, `gizmo_drag/camera_0{1,2}_*.screenshot.png`, `preview_resize/resize_0{1,3}_*.screenshot.png`, `import_edge/i_empty.screenshot.png`, `p2_curved_safe_distance/*.screenshot.png`, `p2_project_v2/*.screenshot.png` (each); `mayChange`: `keyboard/{pilot_view,final_view}.screenshot.png`, `pilot_look/*.screenshot.png`, `preview_off_in_pilot/*.screenshot.png`, `p2_shortcut_filters/*.screenshot.png` (the rig may be out of view) |
| P2-11c B-L2 (+ B-L10 Z half, Q13) | `framingBounds → 'layout'` with `FramingPolicy`'s three named boxes `generativeBox`, `wallBox`, `stageExtent` (§6.10, 07 C34; identical results on every harness wall) (rotation-invariant width, `facing`); `resetTo(framing)` with `wrapDeg`; the consumers; camera Z minimum removed and the input relabelled | `Wall.js#flatBounds`, `WallLayout.js#framingBounds`, `OrbitController.js#updateTargetPosition`, `CineCamera.js#translateBy` (B-L10) | `{concave_offsets,convex,mixed,box_corner,large_wall}/panel_ids_combined.screenshot.png` (each), `p2_mixed_content/*.screenshot.png`, `p2_curved_safe_distance/*.screenshot.png` (orbit target and Reset pan), `p2_curved_safe_distance/concave30__export-safe-distance__*.obj` (D from the chord width: 2.92 → 1.88 m), `p2_zero_inputs/*` (camera Z 0: `D0 = null`, `Not aimed at wall`), `ui_visual/*.text.json` (each: the "Z Distance from Wall (m)" label is in all seven); the other `p2_curved_safe_distance` OBJs are expected **unchanged** (D is height-limited); `mayChange`: `ui_visual/*.styles.json`, `ui_visual/*.sidebar.screenshot.png` (label width) |

- If Feature 3 step A lands first, it adds `'flat-pivot'` and P2-11c replaces it; 03 step F is then empty (03 §5.7).
- **Unblocks:** F3 (the pivot replaces flat assumptions everywhere; P2-11c is 03 step F), F2 and F1 T9 (soft: true bounds and coverage through `columnQuads`).

### P2-12 · Memory and panel-mode textures: B-H5, B-L12, B-L20, B-L30, B-M16, B-L19 (L, 3 d · risk Med)

P2-12a and P2-12d merge in the owner-visible block (depends on P2-1); P2-12b and P2-12c in the remainder (P2-12c after P2-11b).

| Commit | Site | Rows removed | Expected manifest |
|---|---|---|---|
| P2-12a B-H5, B-L12 (only if Phase 1C did not land them) | `dispose.*` retired (always dispose) | `LEDWallView.js#rebuild` (B-H5), `TransformGizmo.js#rebuild/#detach` (B-L12) | empty; `mayChange`: `keyboard/*.screenshot.png` (program-id sort ties) |
| P2-12b B-L20 | `LruCache(64)` of masters; normalised key | `LEDPixelTextureFactory.js#tile` (B-L20) | empty |
| P2-12c B-L30 | `CameraHub.refresh({poseOnly})`: pose-only calls skip `syncSafeDistance` and rewrite all far-corner slots of the lines and the fill in place (`updateFrustumDepths`) | `CameraController.js#CameraHub.refresh` | **expect empty**: positions are identical, because the depths are recomputed on every pose change. `mayChange`: `camera/*.screenshot.png`, `gizmo_drag/camera_*.screenshot.png`, `pilot_look/*.screenshot.png`, `preview_off_in_pilot/*.screenshot.png` (transparent-object sort ties: the safe-distance and frustum objects are no longer re-created, so their ids no longer grow) |
| P2-12d B-M16 + B-L19 | panel mode with panel IDs samples the section canvas (§6.15); `geometry/TextureBudget.js` (07 X3's module, early); `panelPxPerLed` gets 07 §6.12's **wall-wide** budget | the B-M16 id leaves `TextureAtlas.js#panelPxPerLed` (row deleted) and `PanelIdRenderer.js#panelCanvas`; that row keeps B-L19 with the text "reachable only with `uv.panel_uvs = 'panel'`" (for 04 UV-9) | `toggles/09_panelids_panel.screenshot.png`. `toggles/06_ledsim_panel` must stay **identical** (LED sim keeps per-panel UVs) |

- **Unblocks:** F4 UV-9 (section-space panel UVs in the viewport; 04 adds the export half and the option), F5 (memory headroom for HDR and PMREM textures).

### P2-13 · Remaining items and clean-up: B-L35, B-L17, B-L36, B-L31, B-L1 (XL in total, 12 d · risk Low–Med)

P2-13a (1.5 d) and P2-13e (7.5 d) merge in the feature-gate block; the rest (3 d) in the remainder.

| Commit | Site | Rows removed | Expected manifest | Effort |
|---|---|---|---|---|
| P2-13a B-L35 | `LogoLoader` (allowlist, 2 MiB cap on the file and on the stored bytes with the downscale loop, 64 distinct images, SVG sanitising and sizing, decode check); `domain/LogoRules.js`; drawing guard | `SectionLogosPanel.js#onUpload`, `PanelIdRenderer.js#sectionCanvas` | `logos/*` expected **unchanged** (it uploads a small PNG, which is stored verbatim); `p2_project_v2/*` logo list and dialogs (the BMP is now stored as a downscaled PNG); `mayChange`: `p2_project_v2/*.screenshot.png` (the downscaled BMP logo on the panel-ID canvas) | M (1.5 d) |
| P2-13b B-L17 | `#wall-texture-warning` (§3.4) from `WALL_REBUILT.textureStatus`; `WallSection.exceeds4K` unchanged | `WallSection.js#exceeds4K` (documented as per-section by design) | `ui_visual/08_collapsed_and_4k_warning.{styles,text}.json`, `ui_visual/08_collapsed_and_4k_warning.{sidebar,viewport}.screenshot.png` | S–M |
| P2-13c B-L36 | toggle markup + key handling; `setToggle` everywhere and `flipToggle` re-implemented on it (§6.18) | `index.html` documentation entry | `p2_project_v2/*toggle_aria*.json`; `mayChange`: `ui_visual/*.text.json`, `ui_visual/*.styles.json` (the new attributes, if captured) | M (1 d) |
| (P2-13d) | **Dropped (07 C52).** B-L24 has named owners: 01 T7 (`.view-btn.active`) and 06 T4a (badge placement) | – | – | – |
| P2-13e B-L31 | JSON v2 per 07 §4.2–§4.7 for the Phase-2 keys (§4.6; **no feature-owned key**: neither `face_orientation` nor `show_pivot_marker`, 07 C39): `ProjectSchema` rows, the validator's v2 path, the `file` and `zip` writer, `core/sha256.js`; `CineCamera.assign`, `Prop.assign`, the ±100,000 m writer bounds; `applyImportedPose` on both controllers; `ProjectIO.#applyV2` (§6.17); `PROJECT_REPLACED` + `syncFromModel()` on four panels | `ProjectSerializer.js#write` (B-L31) | `**/*__export-json__*.json` (each), ALLZIP (each; JSON entry), `p2_project_v2/*` (states, dialogs, screenshot, the three JSON exports); `mayChange`: `**/roundtrip_import_result.json`, `box_corner/zipjson_import_result.json` (a v2 re-import of the app's own file restores the same state, so no change is expected) | XL (7.5 d) |
| P2-13f B-L1 | the decision (Q10) is taken at Phase 2 kickoff and recorded in §5.6; this commit is only the code: `curveBeforeFirstPanel` retired; ARCHITECTURE §1.4 documents it (amendment A6). It may land at any time after the recorded decision | `WallLayout.js#computeWallLayout` | empty. If the owner chooses to change the convention instead, the manifest is every curved output: `{concave_offsets,convex,mixed,large_wall}` OBJ/glTF/screenshots and `p2_curved_safe_distance` | S |
| P2-13g clean-up | `Strategies.mesh` → `geometry/MeshProfiles.js`; `framingBounds` and the three named boxes → `geometry/FramingPolicy.js`; `deepFreeze` from `domain/rules.js`; `Strategies` deleted; `check.mjs` rule 8 rewritten. Lands after F1-5 and F3 step A have edited their keys (§4.1) | – | empty | S–M |

**P2-13e effort breakdown (7.5 d).** Schema rows and the validator's v2 path for the Phase-2 keys, including the known-but-unapplied `project` and `viewport` keys: 2 d. Writer for `file` and `zip` in 07's key order: 1 d. `core/sha256.js` with both paths and the 07 §6.13 vectors: 0.5 d. `assign`, the writer bounds, `applyImportedPose`, the keep-pose flag and `#applyV2`: 1.5 d. `PROJECT_REPLACED` and four `syncFromModel()`s: 1 d. `serializer-v2` tests, the fidelity property test and the `p2_project_v2` review: 1.5 d.

- **Unblocks:**
  - F6: `generator` and the persisted brand-mark toggle in v2 (T8, T10). Its brand SVGs carry explicit sizes, so they never needed P2-13a.
  - F2, F3 (T7), F4, F5 (T8), F1 (`face_orientation`, added by 01 T9b): the v2 persistence they extend (07 §4.4 protocol).

### Feature-unblock matrix

● hard gate of at least one task group (§1.1); ○ soft gate.

| | F1 normals view | F2 sections + offsets | F3 pivot | F4 UVs + editor | F5 HDRI + car | F6 branding |
|---|---|---|---|---|---|---|
| P2-0 | ● T2 (`--expect`) | | | | | |
| P2-1 | ● T1, T3–T8 (exports with normals fit) | | | ● glTF UVs fit | | |
| P2-2 | **● core** | | | | ○ lit materials | |
| P2-3 | ● T9 (validated input) | ● validated, unique ids | ● T7 | | | ● T8 (legacy palette fill); ○ escaped templates |
| P2-4 | | | | | ○ previs | |
| P2-5 | ● T9 (band σ) | ○ band per floor run | ○ band follows pivot | | | |
| P2-6 | | | | ● texture names | | |
| P2-7 | | | | **● core** | ○ UV bake | |
| P2-8 | | ● integer counts (8a) | ○ ordering only | | | |
| P2-9 | | **● click-select, typing guard, gizmo sign**; ○ axes | ○ marker drag | ● typing guard | ○ projection-point drag | |
| P2-10 | | | ● step C | | ○ superseded by 07 R1/R2 | |
| P2-11 | ○ coverage σ | ○ true bounds | **● = step F** | | | |
| P2-12 | | | | ● UV-9 (panel IDs in the viewport) | ● memory (if 1C H1 did not land) | |
| P2-13 | ○ persistence | **● v2** | ● T7 | ● v2 | ● T8 | ● T8, T10 (`generator`, brand mark) |

**Total effort:** 4 (P2-0) + 0.5 (P2-5a) + 2 (P2-1) + 2 (P2-2) + 0.5 (P2-8a) + 4 (P2-3) + 0.5 (P2-4) + 2 (P2-5b) + 1.5 (P2-6) + 2 (P2-12a, d) + 4 (P2-7) + 1 (P2-8b–d) + 2 (P2-9a–d) + 1.5 (P2-13a) + 7.5 (P2-13e) + 2 (P2-9e–j) + 2 (P2-10) + 3.5 (P2-11) + 1 (P2-12b, c) + 3 (P2-13 rest) = **46.5 days** of batch work, plus **about 9.5 days** of per-commit gate overhead (§1), so **about 56 days** (XL). Branches may be developed in parallel; merges are serial (§2.4), interleaved with feature merges once their gates are in (§1.1).

---

## 11. Risks and open questions

### 11.1 Risks

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | Downstream DCC/engine pipelines compensate for the old inverted normals (flip on import), and break after P2-2 | Med / Med | Release note on the Pages site and in the README; the constant OBJ header line states the convention (01 CR-3). Feature 1 adds the per-section LED side for walls that genuinely face the other way. Q2 keeps glTF single-sided so errors are visible rather than hidden |
| R2 | Large intentional diffs (P2-2, P2-7, P2-13e) hide an unintended change; P2-7's combined UVs are re-baselined twice (here and in 04 UV-7/UV-8, accepted in Q4) | Med / High | `--expect` fails on undeclared diffs **and** on declared-but-unchanged outputs, and neither a within-tolerance PASS nor a `JITTER` satisfies an `expect`. One bug × one consumer per commit. Invariance commits (P2-2a/b, P2-8d, P2-12a–c) carry empty `expect` lists. The second UV re-baseline is reviewed as a layout change only (04 §8.3 "must not change" columns) |
| R3 | Merge conflicts in `LegacyCompat.js`, `ProjectIO.js` and the exporters | High / Low | Serial merges in the §1 order. Each card lists its files |
| R4 | The validator rejects or alters files users rely on | Low / Med | Values are corrected, not rejected. Structural limits (0 sections, more than 200, unknown format, newer major version, oversize file) reject, and the UI enforces the same limits. P2-8a lands before the validator, so the UI already produces only values the validator accepts unchanged (criterion 16). v1 files go through 07's legacy `\|\|` migration first, so every file legacy imported silently still imports silently. All CFG7 configs import with zero warnings |
| R5 | Disposal and pose-only refresh change three r128 draw order (ids or program ids) | Med / Low | Separate commits with empty `expect` lists and explicit `mayChange`. Revert on any FAIL (REFACTOR_PLAN 1C rule) |
| R6 | Screenshot differences below the FAIL threshold (WARN) on undeclared outputs pass unnoticed, or reviewers learn to rubber-stamp the harness's known jitter | Med / Med | The known jitter lives in one evidence-backed file, `expected/_nondeterminism.json`, applied automatically with tight bounds (≤ 1 level, ≤ 8 pixels, listed outputs only) and reported as `JITTER`. Every other undeclared WARN must be reviewed and declared under `mayChange` with a reason, or fixed. Adding to the allowlist needs its own code-free commit with self-consistency evidence (§8.1) |
| R7 | Multi-MB glTF data URIs exhaust memory on huge walls | Low / Med | P2-1 removes the hard failure. A GLB (binary) export is a follow-up, not in Phase 2 |
| R8 | A future three.js upgrade (decision D2, 07 workstream f) invalidates assumptions | Low / Low | Phase 2 fixes are r128-agnostic: pure geometry and IO, `visible` toggling rather than layers, the chunked encoder, and an explicit Uint32 index attribute at ≥ 65,535 (correct in every release) |
| R9 | Owner decisions (Q4, Q5, Q6, Q10, Q13, Q17, Q19) block P2-7, P2-9, P2-11 and P2-13 | Med / Med | Recommended defaults below. The batches before P2-7 need no decisions |
| R10 | A manifest misses an output (a scenario records a field in an unexpected place) or names one that no longer exists | Med / Low | Manifests are written by grepping the parent's baseline (§8.2) and use segment-agnostic, filename-agnostic patterns with `each` for whole output kinds; §8.5 lists where the fields this roadmap touches are recorded. Step 3 of the gate catches anything still missed |
| R11 | Sibling specs (01, 04, 07) are implemented from their own text and collide with this roadmap (double flips, a second v2 shape, a deleted helper, a second validator) | Med / High | §5.6 is authoritative and lists each amendment; §5.6.1 lists the six deliberate differences from 07; the 07 task mapping in §5.6 says which 07 tasks are delivered here in 07's own modules and signatures. The owner of each sibling spec applies them before implementation. The §8.1 gate rejects a commit that re-flips an already-flipped output without a manifest |
| R12 | The safe-distance band narrows near concave features and still overlaps itself on U-shaped stages | High on such stages / Low | Both are documented and visible: clamped stretches are tinted amber and counted in the OBJ header (§6.9); triangles never flip. Q18 schedules the trimmed offset polyline, which fixes both |
| R13 | The v2 reader drops logos users expect to keep (an external URL they used deliberately) | Low / Low | Dropped logos are listed in M-IMP-5 by name; re-uploading the file restores them. Remote images cannot be allowed without leaking the user's IP and tainting the export canvases |
| R14 | 07's owner implements D2/D4 from 07's text in parallel with P2-3b/P2-13e, producing two validators or two writers | Med / Med | The §5.6 mapping assigns each part once. P2-3b and P2-13e create 07's modules (`io/ProjectValidator.js`, `io/ProjectMigrations.js`, `io/ProjectSchema.js`, `io/ProjectSerializer.js`, `core/sha256.js`) with 07's signatures, so a 07 task that lands later extends them. If a 07 task lands first, the corresponding P2 commit shrinks to the rows that 07 did not cover |

### 11.2 Open questions for the owner (each with a recommended default)

| # | Question | Recommended default | Why |
|---|---|---|---|
| Q1 | Fix the glTF/ZIP crash (P2-1) before the normals (P2-2)? | **Yes** | NORMAL alone pushes `large_wall` into the RangeError band (§0). |
| Q2 | Should exported glTF materials be double-sided? | **No** (key omitted = single-sided per spec). Feature 1 adds no export option (01 Q6, CR-4); revisit only if an engine user asks | Correct winding should be *visible*. Double-sided output hides future orientation bugs. |
| Q3 | Switch the viewport wall to front-side-only rendering? | **No, keep DoubleSide** until Feature 1's face-orientation view exists | The orbit camera can go behind the wall, and an invisible wall would look like a bug. |
| Q4 | In combined mode, should a shorter section be **pixel-accurate** (matches `panel-ids.png`, uses part of V) now, or should Phase 2 jump straight to **per-section 0..1** (your "fill the entire UV space")? | **Pixel-accurate in Phase 2 (P2-7), and accept the double re-baseline** when Feature 4 makes per-section 0..1 the default (04 UV-7/UV-8a/UV-8b) | Per-section 0..1 in the viewport needs 04's material arrays, UV settings and `ResourceTracker` work (UV-5..UV-7), several days of Feature 4. Pixel-accurate fixes the visible distortion now with one texture and stays available as the `atlas` option. The cost is that combined UV outputs change twice (R2). |
| Q5 | Ship the atlas (`'textures/' + Brand.files.panelIdsPng`) in every ZIP and reference it from the combined MTL? | **Yes** (guarded like the section textures) | Makes combined-mode OBJ textured out of the box and gives every ZIP the reference image. It is cheap (the canvas already exists for `panel-ids.png`). The name (never a literal, 06 R-B3b) and the "every ZIP, referenced only while UVs are atlas-placed" rule are 04 §2.3 (b)'s, binding for both specs. |
| Q6 | Fix the hand-written gizmo now, or replace it with three r128 `TransformControls` first? | **Fix now** (P2-9). Replacement is 07 I3's decision (07 Q2), after P2-9, with P2-9's behaviour as its regression contract | The fixes are small and well understood, and F2 needs them early. Replacement touches every Selectable and the harness `keyboard` screenshots. |
| Q7 | Standalone **Export OBJ**: two files (OBJ + MTL without textures), or a single `.zip` with OBJ + MTL + textures? | **Two files, no `map_Kd`** (P2-6c). Point users to Export All (ZIP) for textures | No broken references, no harness-download contract change, no surprise ZIP. The possibly blocked second download is recorded as an accepted observation. |
| Q8 | Import of out-of-range values: correct and report, or reject the file? | **Correct and report** (M-IMP-5) | Users keep their work. The report makes every change visible. |
| Q9 | Error feedback: native `alert`, or a non-blocking toast? | **`alert` in Phase 2**; 07 E1/E2 then switch the same message ids to toasts (styled by Feature 6) | Consistent with today's import errors. The harness already records dialogs. |
| Q10 | Curve convention B-L1 (the step applied before the first panel): keep or change? **Answer at Phase 2 kickoff** (02 T3 and 09 X6 read the convention; the answer is recorded in §5.6 and ARCHITECTURE §1.4; P2-13f's code may land later) | **Keep.** Document it; Feature 3 may add "align wall chord to X". **Decided 2026-10-16: keep** (recorded in §5.6; ARCHITECTURE §1.4) | The convention is what makes multi-section curves continuous. Changing it re-baselines every curved export for a global rotation only. 07 C6 already treats it as the default of every file. |
| Q11 | Keep the 5 mm lift of the safe-distance floor in its OBJ export? | **Keep** | Harmless, and it avoids z-fighting with stage floors in DCC tools too. |
| Q12 | Entering `0` in a field with a minimum: clamp to the minimum, or fall back to the default? | **Clamp to the minimum** (B-L9 table) | The standard behaviour of numeric inputs. It fixes Camera Y = 0. |
| Q13 | Keep the Camera Z ≥ 0.1 m minimum now that coverage raycasts the real wall? | **Remove it in P2-11c**, relabel the input "Z Position (m)", and never clamp Z in gizmo, pilot or Reset (only the ±100,000 m far bound of 07) | On curved, rotated and box walls valid stage space has z < 0.1 (the convex harness wall reaches z ≈ −1.22), and Reset can face −Z. The analyser reports a camera at or behind the wall as "Not aimed at wall". 03's pivot-relative Z rule becomes unnecessary. |
| Q14 | JSON v2: embed logos as data URLs? | **Yes, up to 2 MB per logo (measured after conversion) and 64 distinct images per project**, as 07 `assets[]` (de-duplicated); larger files are refused or, for converted formats, downscaled at upload; only PNG, JPEG, WebP and sanitised SVG data URLs are accepted on import | Self-contained projects, with no external fetches and no tainted export canvases. Typical logos are well under the cap. |
| Q15 | Wording of the new coverage status | **"Not aimed at wall"** (red) | Distinguishes "pointing elsewhere" from "frame too big". |
| Q16 | Adopt 07's limits in the UI as well: panel height ≤ 100,000 mm, LED X/Y ≤ 65,536, curve ±180°, and Add Section capped at 200? | **Yes** (P2-8a, merged before the validator in P2-3b; the section cap in P2-3b), one rule table for UI and import | Import and UI must agree, so the app never writes a file it cannot read back. The caps are far above real stages (aee55ac removed the old caps on purpose, 07 Q15). |
| Q17 | Merge the feature-gate block (P2-8b–d, P2-9a–d, P2-13a, P2-13e) **before** the UV fix (P2-7)? | **No**: owner-visible fixes first, gates immediately after (F2, F3 T7 and F6 T8 merge-ready about day 35 of batch effort). Branding (F6), pivot (F3) and the normals view (F1) do not wait for either | Swapping makes those three task groups merge-ready about 4 days earlier (about day 31) but leaves the UV defect in place about 12 days longer (to about day 35). F4 gains nothing because it needs P2-7 too. Choose "yes" if section editing is more urgent than the UV fix. |
| Q18 | Safe-distance band near concave features and on U-shaped stages: accept the tinted narrowing and the documented overlap, or build the trimmed offset polyline (offset every segment by D, drop collapsed segments, intersect the remaining offset lines, clip against the rest of the wall)? | **Accept in Phase 2**; schedule the trimmed offset polyline with Feature 2's per-floor-run band if U-shaped or tightly curved stages are common for you | The local clamp guarantees no flipped triangles and the tint makes the narrowing visible; the trimmed offset fixes both the narrowing and the overlap but is a separate geometry problem (about 2–3 days with its own fuzz tests). |
| Q19 | When a project saved with the camera preview **off** is opened, and the preview is then turned on, should the camera keep the saved pose or reset as it does today? | **Keep the saved pose once** (the next enable skips `resetPose()`); toggling the preview within a session still resets, as today | Otherwise the saved pose of a disabled camera is meaningless and silently lost; the in-session behaviour users know is unchanged. |
