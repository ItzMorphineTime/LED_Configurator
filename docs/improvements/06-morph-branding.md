# Feature 6: Morph business branding

| | |
|---|---|
| **Status** | Implementation-ready specification (Phase 3), revision 3.1. **Plan review (2026-10-16):** the visual prototype's canonical location is the private, git-ignored `Morph Brand Assets/prototype/` (header row), so the copy the brand owner reviews (R2) no longer depends on session scratch storage. **Revision 3.1** applies the cross-spec consistency review (07 §0 C32-C62 and 0.4):<br>- `scene.wallBack` is **#403C37** everywhere (5.12);<br>- 5.12's per-key table is the **spec of record**: each later feature lands with these values and treatments in its own commit, at the render-order slots of spec 01's registry;<br>- B-L24 has named owners: `.view-btn.active` is spec 01 T7's, the badge stacking is this spec's **T4a**; **T11 is dropped** (07 C52);<br>- the header is a three-column grid with the history group of spec 07 H2 (3.2, C50); `#perf-hud` and `#viewport-top-stack` are placed around the reserved zone (3.3, C51);<br>- the sRGB switch is spec 07 U3's, so ThemeBridge needs no linear kind (R6, C54);<br>- revisions are assigned at merge (C40); the font gate's rebuild row is `F6-1`; the ZIP atlas name is `'textures/' + Brand.files.panelIdsPng`; probes read colours from the palette hook (C53); one CSS link order (C52).<br>Revision 3: Revision 2 checked the re-baselining plan against the real harness, added overlay contrast against the new default wall, mapped the sibling theme keys and split out the owner-gated work. Revision 3 makes these changes:<br>- rebases every JSON statement on **spec 07 revision 2, section 0** (snake_case, `"version": "2.<n>"`, `generator` as the 2nd key, no timestamps, C11 already adopted);<br>- reconciles the per-key contract with **spec 01 CR-8**;<br>- corrects the T5 and T11 re-baselining lists and the U4 font-binding timing;<br>- makes panel frames adaptive, and gives the solid red helpers and the red chrome indicators a Morph Black neighbour;<br>- requires closed `Line` geometry for dashed outlines (the r128 `LineLoop` dash artefact);<br>- renames the utilities stylesheet so it does not collide with sibling stylesheets, and aligns the css-slices outcome with spec 07 S7;<br>- fixes the smaller gaps listed in the review. |
| **Builds on** | `docs/ARCHITECTURE.md` (binding contract: section 3.4 `Theme`, 6.2 rebuild policy, section 9 row 6, the layer rules of 1.3), `docs/REFACTOR_PLAN.md` (Phase 3 order: 1, **6**, 3, 2, 4, 5), and **spec 07 revision 2** (`07-platform-foundations.md`). Spec 07's section 0 decisions are binding here (C1 snake_case keys, C2 `"version": "2.<revision>"` plus `format`, C10 `generator` as the 2nd key and no timestamps, C11 the legacy colour fill). Its project JSON v2 schema (4.2-4.6) is authoritative for every JSON field in this spec; spec 08 defers B-L31 to it. |
| **Legacy reference** | `index.html@cd3fd3f`. Line numbers refer to that file (CSS 11-870, markup 872-1276, script 1277-5096). Bug ids refer to the verified defect list ([`docs/DEFECTS.md`](../DEFECTS.md): `B-H*`, `B-M*`, `B-L*`). |
| **Hard prerequisites** | Phase 1 merged (WP1-WP10) with the full harness green. **The owner's explicit OK to publish the brand files listed in 5.8** blocks T4b, the README lockups of T9 and T10 (which loads two of those files); everything else is ungated. T8 and the persistence half of T10 need spec 07 D3/D4 (`ProjectMigrations`, the v2 writer). The History row of T10 needs spec 07 H1. |
| **Coordinates with** | - Spec 01: `#toggle-normals`, `.view-btn.active`, `SceneTheme.wallBack`/`debug`, and its CR-8 token contract.<br>- Spec 02: `SceneTheme.selection`.<br>- Spec 03: `SceneTheme.pivot`, `--pivot-warning`, its CSS that still uses legacy tokens, and its Q10 about the OBJ header.<br>- Spec 04: `Theme.uv`.<br>- Spec 05: `SceneTheme.hdri`, `Brand.files.hdriPixelMap`, and the colour-management seam of risk R6.<br>- Spec 07: JSON schema, `APP_VERSION`, `Brand.jsonGenerator`, `contrast.test.mjs`, X1 switches and focus outlines, the H1 History rows, S7 css-slices, the header slot of H2's history group (C50), `#perf-hud` and `#viewport-top-stack` (C51), and U3's sRGB switch (C54).<br>- Spec 09: `Brand.filePrefix`, `Brand.jsonGenerator` (its stage-pack manifest and spec-sheet generator, C62), and the `20-29` stylesheet block.<br>The per-key contract is in 5.12. |
| **Brand source** | The private, git-ignored folder `Morph Brand Assets/`: `README.md`, `Colour Guidelines/Morph-Colour-Guidelines.md`, `Logos/SVG/*.svg` (+ PNG), `Brand Story/Morph-03A-Brand-Story.pdf`. Nothing from that folder is in the repo today. |
| **Visual prototype** | **Canonical location: `Morph Brand Assets/prototype/index.html`** inside the private, git-ignored brand folder (the `Morph Brand Assets/` rule in `.gitignore` covers it, so it stays out of the repo until Q2 is answered). It opens from `file://` and contains everything it needs: the brand files it shows (wordmark, monogram, favicon and app icon, as SVG and PNG) sit next to `index.html`, and three.js r128, JSZip and the fonts load from their CDNs. Screenshots in the same folder: `screenshot.png` (default state), `shot-camera.png`, `shot-camera-exports.png` (sidebar scrolled to the gold CTA), `shot-panelids.png`, `shot-sections.png`, `shot-pilot.png` (1280×800), `shot-narrow.png` (800 px), and `original-screenshot.png` (before). It is generated from `git show cd3fd3f:index.html` by `build-prototype.mjs` + `brand-style.css`, which belong in `Morph Brand Assets/prototype/tools/`. The prototype and its tools are already in place there. This is the copy the brand owner reviews (R2). Every value it demonstrates is restated in this spec. Its deviations from this spec are listed under "Prototype notes" below. |

### Prototype notes (deviations from this spec)

- It keeps the legacy token names as aliases for the inline styles it does not rewrite.
- It adds a `?demo=camera|panelids|pilot|sections` hook (plus `&scroll=bottom`) that clicks existing controls for screenshots.
- It draws the toggle ring with a border instead of an inset shadow.
- It already applies the badge offset (`bottom: 64px`) that T4a ships (T11 is dropped, 07 C52).
- It reads the scene tokens with a 30-line inline bridge instead of `theme/ThemeBridge.js`.
- It places the SVGs next to `index.html` instead of under `assets/brand/`.
- **Superseded values.** The prototype differs from this spec in these values:
  - Its frustum is a single white line at 0.6 opacity, which `shot-camera.png` shows vanishing over the Studio Grey wall (about 1.18:1). This spec replaces it with the two-tone treatment of 3.8/6.6.
  - Its camera body is 0.9 opacity with no outline. This spec uses 1.0 plus a Morph Black edge outline.
  - Its panel frames are a single `#616161`. This spec uses the adaptive light/dark frame of 3.8/6.7.
  - Its Steel swatch is `#7f7f7f`. This spec uses `#6c6c6c`.
  - Its selection badge is a translucent chip. This spec uses an opaque chip with a Morph Black outer ring.
  - The red border of its preview window has no outer ring. This spec adds one.
  - Its active swatch has no inset Morph Black ring. This spec adds one.
  - Its header `<h1>` is display-hidden at 900 px. This spec visually hides it instead.
  - Its field labels use 0.1em tracking. This spec uses 0.06em, with `.section-row { align-items: end }`.

---

## 0. Decisions at a glance

| # | Decision | Section |
|---|---|---|
| D1 | Product name **"Morph LED Configurator"**. The header is one `<h1>` holding the `morph-wordmark-dark.svg` artwork (alt "Morph") followed by the live-text product name "LED Configurator", so its accessible name is "Morph LED Configurator" at every width. "MORPH" is never typeset in live type. | 3.1, 3.2 |
| D2 | The UI stays **dark**. Every surface derives from Morph Black `#0A0A0A` through four neutral elevation greys (`#111111`, `#161616`, `#1F1F1F`, `#262626`/`#333333` borders). The cyan/magenta identity and every hue-named token are removed. | 3.4, 5.1 |
| D3 | **Signal Red** `#C51622` is the interactive accent, used only for graphics and large text. Every red indicator has, on at least one side, an **opaque** neighbour `<= #161616`, where red keeps >= 3:1 (2.76:1 on `#1F1F1F`, so never there). The red elements that sit over the live scene therefore get an opaque `#111111` chip or a 1 px Morph Black outer ring (3.5): the selection-badge bar, the preview-window border, the pilot banner and the active pilot button. The banner and the button also carry white text or icons at 5.98:1. Small red text uses the derived tint `#F2555A` (>= 4.88:1 on every surface used). | 3.4, 3.5, 3.12 |
| D4 | **Pivot Gold** `#F2B705` appears once in the UI: the primary call to action, **Export All (ZIP)**, with Morph Black text (10.89:1). Nothing else in the chrome, the scene, the canvases or the default palette is gold or gold-like (CIEDE2000 >= 20 from Pivot Gold), including the theme keys that specs 01-05 add (5.12, enforced by U6/U10). The gold point inside the logo artwork is part of the mark and is not counted as layout colour. That reading is a judgement call, which Q7 puts to the owner together with the duplicate-mark count of Q6. | 3.3, 3.4, 5.12 |
| D5 | Typography: **Montserrat** (identified visually from the Brand Story, see 3.6) for UI text; **JetBrains Mono** stays for numbers, readouts and panel-ID labels, with weight 700 loaded from T5 (the step that also re-baselines every PNG). Outfit is removed in T5. | 3.6 |
| D6 | Viewport watermark: **`morph-monogram-dark.svg`**, 44 px wide, top-left beside the gizmo column (top 24 px, left 80 px), full opacity, never recoloured. It is hidden while `#pilot-info` is visible, so it can never collide with the centred pilot banner. On by default, subject to Q6, which states the duplicate-mark and gold-point count. The Fivefold logo is deleted (ungated, T4a). | 3.3 |
| D7 | **CSS tokens are the runtime source for every chrome, scene and canvas colour and font; `Theme.js` holds identical fallbacks under the U4 parity test.** `theme/ThemeBridge.js` (pure) reads the `--scene-*`, `--canvas-*`, `--uv-*`, status and font tokens through an injected reader and returns an object of `Theme`'s exact shape. `App` changes by one line. A permanent colour change is **two edits in one commit** (the token and its `Theme.js` fallback); U4 fails if they disagree. The bridge does not reduce edits. It gives these benefits:<br>- one token vocabulary for chrome, scene and canvases;<br>- a CSS override (a user stylesheet, devtools, a future theme) re-colours the scene on reload without touching JS;<br>- a fallback that keeps Node tests and a missing stylesheet safe. | 5.4, 5.5 |
| D8 | User data defaults (the section palette, the default section colour) live in `Theme.js`, not in CSS, because they are written into exports and must not depend on a stylesheet. The new 8-colour palette is brand-aligned and contains no gold. It **raises the minimum pairwise distance in every vision mode** (no near-duplicates), at the cost of lower cyclic-adjacent and background distances than the legacy neon palette; every metric stays above the U7 thresholds (6.3). | 3.9 |
| D9 | Export branding: filenames from `Brand.filePrefix = 'morph-led-wall'` (introduced in T6b together with the derived `Brand.files`), ASCII-only OBJ/MTL comment headers, glTF `asset.generator: "Morph LED Configurator"`. The JSON `generator` is spec 07's **2nd key** (C10), written as `{ name: Brand.jsonGenerator.name, version: APP_VERSION }`. `Brand.jsonGenerator` is this spec's frozen `{ name }` record (4.2). Material and object names (user data) do not change. | 7, 4.2 |
| D10 | The optional Morph mark on the **combined panel-ID PNG export only** (never on viewport textures or ZIP textures), off by default, toggled next to "Export Panel IDs". It moves or is skipped when a section logo would collide with it. | 3.8, 6.5 |
| D11 | Brand assets are copied into the tracked folder `assets/brand/` (8 files, listed in 5.8: 6 in T4b, the 2 README lockups in T9) **only after the owner's explicit OK**, because GitHub Pages and the git history make them permanently public. A `NOTICE.md` excludes the Morph marks from the Apache-2.0 grant. | 5.8 |
| D12 | These colours stay unchanged, because they are functional conventions:<br>- gizmo axis colours stay XYZ = RGB;<br>- the panel-ID border cycle stays R/G/B;<br>- the face-orientation debug colours of spec 01 stay blue/red (they are bound to tokens, per spec 01 CR-8, holding spec 01's values);<br>- the person and car prop colours stay as they are (the harness picks the person by its blue).<br>U11 asserts all of them. | 3.8, 5.12 |
| D13 | No new events, no new `Strategies` keys, no new keyboard shortcuts. One rebuild call site is added (ARCHITECTURE 6.2 row `F6-1`, the font gate; named row ids, 07 0.4), and it never fires in the harness. | 5.6, 5.9 |
| D14 | The work lands in **small, separately verified steps**. T1, T2, T3 and T6b are proven by the harness: T1 changes only recorded class keys, T2/T3 change nothing, T6b is byte-identical under a rename map. Every intentional change (UI chrome, brand artwork, British copy, scene/canvas, export strings, palette) is re-baselined in its own step with an exact list of expected outputs (8.4). | 8.4, 10 |
| D15 | **Scene overlays keep >= 3:1 on the background and every palette colour.** No single colour can do this against both the dark scene and the light default wall, so there are three treatments:<br>- **Line overlays that can cross a wall section** (frustum lines, selection outlines, pivot glyph, UV-viewer wireframe) are **two-tone**: a light (or Signal Red) dashed core over a Morph Black halo, drawn from closed `Line`/`LineSegments` geometry (never `LineLoop`, 6.6).<br>- **Panel frames**, which always lie on a section, are **adaptive**: each section's frames are the light `#D4D4D4` or the dark `#0A0A0A` frame, whichever contrasts more with that section's colour (6.7).<br>- **Solid red helper meshes** (camera body, HDRI marker) carry a 1 px Morph Black **edge outline**. | 3.8, 6.6, 6.7, 5.12 |

---

## 1. Summary and user value

**Problem.** The configurator still carries a placeholder identity: a cyan-to-magenta gradient square and "LED**WALL** Configurator" in the header, a cyan/magenta accent system, a third-party (Fivefold) logo burned into the viewport, no favicon, an invalid author meta tag, and generic "LED Wall Configurator" strings and `led-wall-config.*` filenames in every export. The tool is now a Morph product, used in front of clients and crews, and its screenshots, screen recordings and exported files leave the building.

**For whom.**
- **Morph operators and technical directors**, who use the tool in client meetings and pre-production. The tool should look like part of Morph's control surface family, not a demo.
- **Clients and stage vendors**, who receive screenshots, panel-ID PNGs and OBJ/glTF/JSON files. These should identify where they came from.
- **The maintainer**, who needs one token vocabulary for every colour. Today hex literals are scattered across CSS, 65 inline styles, Three.js materials and canvas code. After this feature:
  - every literal has a named role;
  - a permanent change is the token plus its `Theme.js` fallback in one commit, kept equal by a test (U4);
  - a CSS-only override re-colours chrome, scene and canvases alike.

**Brand positioning (summarised from the Brand Story, in our own words).** Morph presents itself as interactive media for live environments: live events, LED systems, virtual production and interactive content. Three cues carry the identity. The red wave stands for controlled movement and adaptation. The gold point marks the moment a decision is committed. The strong geometry of the M and the wordmark stands for technical precision. The voice is short, confident and engineered; the slides pair Morph Black surfaces with white Montserrat type, short red rules as accents and a single gold detail. For this tool that translates into: a calm, near-black, precise UI; red where something moves or is being changed; gold reserved for the one decisive action (committing the export); concise sentence-case copy.

**Outcome.** A dark, Morph-branded configurator whose 3D scene, canvases and exports follow the same token system, implemented without touching the geometry or export logic, and verified step by step with the golden-master harness.

---

## 2. Current state

### 2.1 Brand surfaces in the legacy file

| Surface | Legacy | Lines |
|---|---|---|
| Head | `<meta author="Joe Loe">` (invalid), `<title>LED Wall Configurator</title>`, no favicon, no `theme-color`, Google Fonts URL for JetBrains Mono 300-600 and Outfit 300-700 | 6-10 |
| Header | `.logo-icon` 36 px gradient square (cyan to magenta) + `.logo-text` "LED<span>WALL</span> Configurator" (span in cyan); no heading element | CSS 58-80, markup 875-878 |
| Header stats | `.stat-value` JetBrains Mono 18 px, cyan, `text-shadow: var(--glow-cyan)` | CSS 89-94 |
| Viewport watermark | Inline SVG `.company-logo`, `aria-label="Fivefold"`, viewBox 1824×894, 9 paths `fill="#b85618"`; CSS `top: 20px; left: 70px; width: 120px; opacity: 0.7; drop-shadow` | CSS 515-524, markup 1256-1266 |
| Primary button | `.export-btn` cyan-to-magenta gradient, white text (two blocks) | 425-444, 827-848 |
| Accents | `--accent-cyan` focus, selected and hover states; `--accent-magenta` section-title bar; cyan readouts (5 inline styles); amber/blue/pink/purple gizmo button states | 18-31, 244, 317-323, 348-375, 405, 604-660, 1035-1094 |
| Pilot banner | `rgba(255, 68, 102, 0.95)`, `display: none` / `.visible { display: block }`, with an emoji prefix "🎥 PILOT MODE — ..." | CSS 662-682, markup 1270-1272 |
| Preview window | inline `border: 2px solid var(--accent-cyan)`, cyan glow, header "📷 Camera View"; resize-grip SVG path with the presentation attribute `stroke="var(--accent-cyan)"` | 1185-1199 (path 1188) |

### 2.2 Colour and font literals outside the token block

- **CSS:** 8 `rgba(0, 240, 255, …)` rules, `#ff4444`/`#ff4466` danger, `#ff6b35` warning, gizmo `#ffaa00`/`#00aaff`/`#ff4466`/`#aa66ff`/`#888`/`#000`, `rgba(18, 18, 26, 0.9)` ×4 overlay chips, dead `.section-color-0..7` (737-744) and dead `.grid-lines` (468-477).
- **Markup:** 65 inline `style=""` attributes, 24 of them with colours or `var(--…)`; one presentation attribute `stroke="var(--accent-cyan)"` (1188).
- **Script templates:** the logo rows (`sectionDiv.style.cssText` 2200, then 2202, 2206, 2215, 2229, 2232), the offset hint `style="font-size: 9px;"` (3963) and the six literal swatches (3970-3975).
- **Three.js:** scene background `0x0a0a0f` (1431), grid `0x2a2a3a`/`0x1a1a24` (1446), frames `0x4a4a5a` (1563), camera body `0xff6600` @ 0.8 (2334), frustum `0xffaa00` (2407, 2426; near plane 0.2 m, depth 15 m), safe zone `[0.2, 1, 0.4]` → `[1, 0.2, 0.2]` + `0xff4444` line + `'#ff4444'` `'bold 32px Arial'` label (2697-2749), props (2840-2960), gizmo axes (3029-3091).
- **Canvas:** background `'#0a0a0f'` (1693, 1821, 2009, 2064; also the LED-tile background), fonts `'JetBrains Mono'` bold (2034, 2092; weight 700 is not loaded), `'Outfit'` (2107).
- **UI status colours:** `'#00ff66'`/`'#ffaa00'`/`'#ff4444'` (2518-2524).
- **Palette:** `sectionColors` (1379-1382), default `'#00f0ff'` (1406), six swatches including `#ffffff` (3970-3975).
- **Export strings:** OBJ header (4557, 4559), MTL header (4561), glTF generator (4721), safe-distance OBJ header (2792), filenames `led-wall-config.{json,obj,mtl,gltf}`, `led-wall-export.zip`, `panel-ids.png`, `safe-distance-floor.obj` (4520-4549, 4915-4964, 2826). The JSON has no generator field.

**Consequence.** A CSS-only rebrand would leave the 3D scene, the panel-ID textures and the exports in the old identity.

### 2.3 What Phase 1 provides (ARCHITECTURE.md)

- `css/02-tokens.css` holds the single `:root` token block (2.1). The 12 stylesheets are contiguous slices of the original.
- `js/theme/Theme.js` (3.4) holds every scene, canvas, palette and export literal in frozen objects `SceneTheme`, `CanvasTheme`, `UiColors`, `Palette`, `Brand`, `Theme`. **Only `App.js` imports it.** Every consumer receives `theme` (or a part of it) by constructor injection: `SceneManager`, `LEDWallView`, `CameraRigView`, `SafeDistanceView`, `PropViews`, `TransformGizmo`, `LEDPixelTextureFactory`, `PanelIdRenderer`, `CameraPanel` (`theme.ui`), `WallController` and `ProjectSerializer` (`palette`), `ObjExporter`/`GltfExporter`/`ProjectIO` (`brand`). A ThemeBridge-built object of the same shape is therefore a one-line swap in `App` (section 7 bootstrap: `theme = Theme`).
- The `io/` layer never imports `theme/` (brand and palette are injected), and `theme/` imports nothing (1.3). Pure layers touch no DOM (R10).
- `PanelIdRenderer.atlasCanvas()` is shared by the combined viewport texture and `ProjectIO.exportPanelIds()` (3.7, 3.10).
- `WallController.setPanelIdStyle(key, v)` is model-only; `rebuildIfPanelIds()` is the separate rebuild call (6.2 rows 14-19).

### 2.4 Related defects and observations

| Id | Relevance | Handling here |
|---|---|---|
| ARCHITECTURE 8.4 | `<meta author>` invalid, no favicon | Author/title/metas fixed in T4a; favicon in T4b; the 8.4 row is deleted in T4b (or in T4a with the favicon noted as gated). |
| ARCHITECTURE 8.4 | JetBrains Mono drawn at 700 but only 300-600 loaded; canvas drawing does not wait for fonts | Weight 700 loaded and the font gate added in T5; the 8.4 row is reduced to the documented safe-label limitation (5.6). |
| B-L24 | Selection badge overlaps the help badge; no `.view-btn.active` style | **Named owners (07 C52):** `.view-btn.active` is spec 01 T7's (F1-2 re-baselines it); the **badge stacking** (the selection badge at `bottom: 64px`, above the help badge; anchored 12 px above the help badge with CSS anchor positioning, so a help badge that wraps to two lines in a narrow viewport pushes it up, with `bottom: 64px` as the fallback; review follow-up F6-T4a3) is this spec's **T4a**, inside T4a's re-baseline of every screenshot. T4a also maps 01's rule to role tokens. This spec owns the badge **position, not its text** (07 C35: per-feature tokens are frozen; 07 I4a rewrites the text once). This spec's former T11 and 08 P2-13d's fallback are dropped; 07 X1 does not re-fix it. The prototype already stacks the badge at `bottom: 64px`. |
| B-L35 | Logo load: no error or zero-size guard | The brand SVGs carry explicit `width`/`height`, so `naturalWidth` is never 0. The optional brand mark (T10) uses its own guarded loader; B-L35 itself stays a Phase-2 fix. |
| B-L36 | Toggles not keyboard accessible | Not fixed here. T4a adds the `--color-focus-ring` token and a `:focus-visible` rule that B-L36 (and spec 07 3.9) will rely on. |
| B-M4 | Unescaped template interpolation | The palette swatch template interpolates constants only. No change. |
| B-L31 | JSON v1 saves almost nothing | Spec 07 (D4) implements the v2 writer that fixes B-L31 (spec 08 P2-13e defers to it). This spec supplies `Brand.jsonGenerator` for spec 07's `generator` (2nd key) and adds one field, `panel_id_style.brand_mark_on_export` (T10), which spec 07 already reserves (4.3, 4.4). |
| Spec 07 X2 | `tests/unit/contrast.test.mjs` parses `css/02-tokens.css` using **legacy** pairs (`--text-secondary` on `--bg-secondary`) | T4a deletes those names, so T4a retargets that file to the role pairs of 3.12; U5 lives there (5.12). |
| Specs 03, 07 | Focus outlines and the pivot-mode CSS written against `var(--accent-cyan)`, `--bg-secondary`, `--border-color`, `rgba(0, 240, 255, 0.1)`, `--pivot-warning: #ffaa00` | Whichever lands later migrates them to role tokens; T4a's legacy-token sweep (R-B3a) covers any that already merged (5.12). |
| css-slices | `tests/static/css-slices.mjs` proves that `css/01-12` are slices of the original | Spec 07 S7 is the single rule (07 C52): the script runs `--report-only`, **scoped to `css/01-12`**, from the first intentional CSS change. If T1 lands before spec 07 E1, T1 makes that switch (5.2). This spec does not delete the script. |

---

## 3. UX design

### 3.1 Product name and copy

| Where | Legacy | New | Step |
|---|---|---|---|
| `<title>` | LED Wall Configurator | **Morph LED Configurator** | T4a |
| Header | LED**WALL** Configurator | T4a (text only): `<h1>` "Morph LED Configurator" in Montserrat 600. T4b: [MORPH wordmark artwork] │ **LED Configurator**, all inside the `<h1>` | T4a, T4b |
| Pilot banner | "🎥 PILOT MODE — WASD: Move • …" | Inline 16 px camera SVG (the existing `#gizmo-pilot` path, `stroke="currentColor"`) + "PILOT MODE — WASD: Move • Mouse: Look • QE: Up/Down • Scroll: Speed • ESC: Exit" (text otherwise unchanged) | T4a |
| Preview header | "📷 Camera View" | Inline 12 px camera SVG + "Camera View" | T4a |
| Visible labels | "Panel Color", "Label Font Color", "Section Label Color", tooltip `title="Custom color"`; the logo row's position options "Top Center", "Center Left", "Center", "Center Right", "Bottom Center" | **Open question Q14**, default (owner decision B14): British English ("Colour", "Centre") in visible labels and tooltips only. JSON keys (`color`) and option values (`top-center`, ...) never change. Its own step because it changes the card text and the logo-row text recorded in 60 baseline files. (T4c added the position options, which this row first missed: they are visible labels too.) | T4c |
| Field labels that wrap | "Angle Between Panels (°)" wraps to two lines under Montserrat with uppercase tracking (prototype), which misaligned the two-column card row | T4a removes the misalignment by layout alone: `.section-row { align-items: end }` aligns the two inputs, and field-label tracking drops to 0.06em. The T4a label-fit check (8.4) lists every `.input-field label` that is still taller than one line at the 1600 px harness width. T4c shortens those labels (default: "Angle Between Panels (°)" becomes "Panel Angle (°)"; Q14), in the same step that already re-baselines the card text. As built, T4a's list held only "Angle Between Panels (°)" (in every card, with every option panel open too), and after T4c it is empty. | T4a, T4c |

Rules: sentence case for labels and buttons except the existing uppercase eyebrow styles (`.global-section-title`, `.stat-label`, `.input-field label`, buttons), which keep `text-transform: uppercase` with letter-spacing. No exclamation marks. No emoji in the chrome (their colour glyphs clash with the palette, and they render differently per OS).

### 3.2 Header lockup

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐ 60 px
│ 24 ┌──────────────┐ 16 │ 16 LED Configurator                    15,360   15     1     0.0°   24 │
│    │ M O R P H    │    │                                          TOTAL    PANELS SECTIONS TOTAL   │
│    │ ~~~~~~~~~~~• │    ^ 1×24 px divider, #333333                  PIXELS                 ARC     │
│    └──────────────┘ 144×41.75 px, morph-wordmark-dark.svg                                          │
│    └──────────────── all of this is one <h1 class="brand-lockup"> ───┘                             │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| `.header` | Grid row 60 px, `padding: 0 24px`. **A three-column grid** (07 C50): `display: grid; grid-template-columns: auto 1fr auto; align-items: center; column-gap: 24px`, holding `[brand lockup \| history group \| stats]`. `background: var(--color-bg-app)` (#0A0A0A, the controlled Morph Black surface), `border-bottom: 1px solid var(--color-border-subtle)`. |
| History group (spec 07 H2) | `.header-history`, left-aligned in the middle column: `#history-undo` and `#history-redo` (two 32 × 32 px icon buttons, `.view-btn`-style chip roles of 3.5) plus `#autosave-status` (Montserrat 500, 11 px, `var(--color-text-secondary)`). **Below 1100 px** the status text collapses to its icon, with the text in `title`; **below 900 px** the status hides (it remains in the Project section). Whichever of T4a and 07 H2 lands second fills the slot and re-baselines the header (T4a's grid with an empty middle column if H2 has not landed; otherwise T4a moves H2's elements into it). |
| `.brand-lockup` | `<h1>` (not a link: a reload would discard unsaved work). Reset: `margin: 0; font: inherit`. `display: flex; align-items: center; gap: 16px; min-width: 0`. Its accessible name is the image alt plus the product name: "Morph LED Configurator". |
| `.brand-wordmark` (T4b) | `<img src="assets/brand/morph-wordmark-dark.svg" alt="Morph" width="507" height="147" decoding="async">`. The attributes carry the exact intrinsic ratio 507:147. CSS: `width: 144px; height: auto; flex: none` (rendered 144 × 41.75 px). Never set both width and height in CSS. The brand minimum width for the wordmark is 120 px. |
| `.brand-divider` (T4b) | `<span aria-hidden="true">`, 1 × 24 px, `var(--color-border-strong)`, `transform: translateY(-5px)`. |
| `.product-name` | `<span>` inside the `<h1>`. Montserrat 600, 15 px, `letter-spacing: 0.02em`, `var(--color-text-primary)`, `white-space: nowrap`. T4a text: "Morph LED Configurator"; T4b text: "LED Configurator". T4b adds `transform: translateY(-5px)`. This is a **visual baseline alignment** chosen by eye in the prototype, not a geometric centring: the 15 px text then sits level with the MORPH letters rather than with the letters plus the wave. Exact centring on the letters would need about 9 px: they occupy y 2.0-80.0 of the 147-unit artwork, so their centre lies 9.2 px above the artwork centre at 144 px width. That looked too high next to the wave. |
| Stats | `.stat-value` JetBrains Mono 500, 18 px, `var(--color-text-primary)`, **no glow**. `.stat-label` Montserrat 600, 10 px, uppercase, `letter-spacing: 0.12em`, `var(--color-text-secondary)`. |
| ≤ 900 px | (existing breakpoint) hide `#autosave-status` (07 C50), hide `.brand-divider` (`display: none`, it is decorative) and **visually hide** `.product-name` (`position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0`), so the heading keeps its accessible name. The wordmark stays at 144 px. In the T4a text-only header the product name stays visible at this width (it is the only identity). |
| ≤ 520 px (new, T4b) | Hide `.brand-wordmark`; show `.brand-monogram` (`<img src="assets/brand/morph-monogram-dark.svg" alt="Morph" width="233" height="172">` inside the same `<h1>`, CSS `width: 36px; height: auto`, `display: none` above 520 px). Below its 120 px minimum the wordmark is never shown; the brand rule says to switch to the monogram. Only one of the two images is ever rendered, so the accessible name never repeats "Morph". (The legacy stats row already overflows below ~600 px; not addressed here.) |

**Clear space.** The kit states 24 px around a mark and 32 px around a lockup, measured from the artwork bounds at master size. Taken as absolute UI pixels, no logo could ever fit a 60 px header, so this spec scales clear space with the artwork. Recommended default for open question Q3: `clear = 24 × (rendered width / master width)` for marks (wordmark, monogram, favicon, app icon); 32 × (rendered/master) for lockups; never below 6 CSS px.
- Wordmark at 144 px: k = 144/507 = 0.284, so the required clear space is 6.8 px.
- Actual: 24 px left (header padding), 16 px right (gap to the divider), (59 − 41.75)/2 = 8.6 px top and bottom. All pass.

**Variant choice (why not the others).**
- `morph-primary-horizontal`: black geometry, meant for light layouts. It would be invisible on the dark header, and it must not be recoloured.
- `morph-dark-event-lockup`: carries its own Morph Black plate, but at a 60 px header height its "INTERACTIVE MEDIA" descriptor would render about 4 px tall, which is illegible.
- monogram + wordmark side by side: that would assemble a new lockup from parts, which counts as altering the logo.

The wordmark alone, followed by a divider and a live-text product name, is a standard "brand │ product" pattern that keeps the artwork intact.

### 3.3 Viewport overlay and watermark

```
 viewport (left edge = sidebar edge)
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │20┌──┐20 ┌─────┐                 ┌──────────── PILOT MODE ─────────────┐  ┌──┐20│
 │  │G │   │ M~• │ 44×32.5 px       │ (only in pilot; watermark hidden)   │  │▢ │  │
 │  └──┘   └─────┘ monogram-dark    └─────────────────────────────────────┘  ├──┤  │
 │  ┌──┐   top 24, left 80                                                    │+ │  │
 │  │R │                                                                      ├──┤  │
 │  ├──┤                                                                      │◎ │  │
 │  │W │                         (3D scene)                                   ├──┤  │
 │  ├──┤                                                                      │↺ │  │
 │  │📷│                                                                      ├──┤  │
 │  └──┘                                                                      │# │  │
 │                                                                            └──┘  │
 │  ┌ Selected: Person ┐  (T4a: bottom 64 px)                       ┌─ Camera View ─┐│
 │  ┌ Drag to rotate • Scroll to zoom • … ┐ bottom 20                 │  preview      ││
 │  └─────────────────────────────────────┘                          └───────────────┘│
 └───────────────────────────────────────────────────────────────────────────────┘
```

| Item | Spec |
|---|---|
| Fivefold logo | Delete the inline SVG (1256-1266) and the `.company-logo` rule (515-524) in **T4a** (it is a third-party mark; removing it needs no approval). Its `drop-shadow` and `opacity: 0.7` go with it. |
| `.brand-watermark` (T4b) | `<img class="brand-watermark" src="assets/brand/morph-monogram-dark.svg" alt="" aria-hidden="true" width="233" height="172">`, placed **after** `#pilot-info` inside `.viewport-overlay`. CSS: `position: absolute; top: 24px; left: 80px; width: 44px; height: auto; pointer-events: none; user-select: none; will-change: transform`. Full opacity, no filter. `will-change: transform` (added by the T4b gate) gives the image its own compositing layer: without it Chrome paints it into the layer of the overlay buttons and re-rasterises their SVG icons with a different anti-aliasing (up to 74 levels on the icon edges), so the watermark would change pixels outside its own rectangle. It is a compositing hint and does not alter the artwork. |
| Default and brand budget (Q6, Q7) | With the watermark on, a default screen shows **two copies of the mark**: the header wordmark and the viewport monogram. It also shows **up to three gold points**: one inside each mark, plus the gold Export All button whenever the sidebar shows the export section. The brand rule asks for "one strong gold moment per layout". This spec reads the gold points inside logo artwork as part of the mark, not as layout gold. **That reading is a judgement call**, so Q7 puts it to the owner. Q6 offers the alternatives "off by default" and "only while the header lockup is not on screen". The recommended default stays **on**: the watermark exists for crops and recordings of the viewport, where the header is absent. |
| Geometry rationale | The gizmo column is `left: 20px`, buttons 40 px. 20 + 40 + **20 px gap** = 80. Proportional clear space for the monogram at 44 px is 24 × 44/233 = 4.5 px, so 20 px is ample. `top: 24px` centres the 32.5 px artwork on the first 40 px button (centre y = 40). The brand minimum width is 32 px. |
| Pilot banner | `.pilot-info.visible ~ .brand-watermark { visibility: hidden; }`. The general-sibling selector needs the DOM order "pilot-info, then watermark". At the 1600×1000 harness size the centred banner (about 575 px wide) spans x ≈ 312-887 px of the 1200 px viewport, and the watermark spans 80-124 px. At narrower windows the banner can reach the watermark, so the watermark is hidden whenever the banner shows. This needs no JS and no `:has()`. The banner keeps its legacy show/hide mechanism (`display: none` / `.visible { display: block }`). |
| Not a control | No id, no hover state, no tab stop, so it is never mistaken for a button and the DOM-id ownership check is unaffected. |
| Exports and preview | It is DOM, so it never reaches the WebGL canvas, the preview render or any export. It **does** appear in OS screenshots and screen recordings of the viewport, which is its purpose, and in the harness's canvas-clipped screenshots (8.4, T4b). |
| Contrast caveat | The white M sits on the live scene. In the reset, front, side and top views that corner shows scene background (#0A0A0A). If the user zooms a light wall behind it, the white M loses contrast. The artwork must not get a plate, shadow or opacity change (the rules forbid altering it), so this is accepted; see Q6 for the "off" alternative. |
| Reserved zone | The rectangle x ∈ [20, 140], y ∈ [20, 270] of the viewport (gizmo column + watermark) is reserved. New overlays from specs 01, 04 and 05 (normals toggle, UV viewer, HDRI panel) must not be placed there. Spec 07's `#perf-hud` sits **directly below it** at `left: 20px; top: 280px` (07 C51). |
| Top-centre stack | Spec 07's `#viewport-top-stack` (the restore banner, 09's share banner and spec 01's legend, in that order) follows `#pilot-info` **and** `.brand-watermark` in the DOM, so this section's `.pilot-info.visible ~ .brand-watermark` selector and the stack's own pilot shift (`top: 72px` while the banner shows) both keep working (07 C51). |

### 3.4 Colour roles (where red, where gold, where white)

| Role | Token | Value | Used for |
|---|---|---|---|
| App background | `--color-bg-app` | #0A0A0A | `body`, header, viewport, toggle off-track |
| Raised surface 1 | `--color-surface-1` | #111111 | sidebar; inputs, mesh-mode options and **readouts** (`.readout`, the camera-info and frustum-status boxes) inside cards |
| Raised surface 2 | `--color-surface-2` | #161616 | section cards, `.global-section`, section headers, secondary buttons |
| Hover surface | `--color-surface-hover` | #1F1F1F | hover backgrounds only (no red indicators on it, see 3.12) |
| Overlay chip | `--color-surface-overlay` | rgba(17, 17, 17, 0.92) | viewport buttons, info badge. Over the scene it composites to `#101010` (black), `#212121` (default wall) or `#242424` (white). Text on it keeps >= 6.15:1, but red does not (2.60:1 at worst), so **the selection badge does not use it** and uses opaque `--color-surface-1` instead (3.5) |
| Borders | `--color-border-subtle` / `--color-border-strong` | #262626 / #333333 | decorative separation / dividers, radio rings, toggle off ring, dashed add button |
| Text | `--color-text-primary` / `--color-text-secondary` / `--color-text-disabled` | #F7F7F5 (Canvas) / #A3A3A3 / #6C6C6C (Muted) | body, values and `.readout-value` (the 5 formerly cyan readouts, JetBrains Mono) / labels, hints and `.readout-label` / disabled only |
| **Accent (Signal Red)** | `--color-accent` | #C51622 | toggle on-track, selected mesh-mode border and radio dot, input focus border, `.global-section-title::before` bar, logo-upload `.has-logo` border, selection-badge left bar, preview-window border, pilot banner and active pilot button (with white text 5.98:1) |
| Accent text | `--color-accent-text` | #F2555A | any red **text** under 18.66 px bold / 24 px regular (danger, delete hover) |
| **CTA (Pivot Gold)** | `--cta-background` / `--color-on-cta` | #F2B705 / #0A0A0A | `.export-btn--primary` on `#export-zip` only |
| Active tool | `--color-control-active-bg` / `--color-on-control-active` | #F7F7F5 / #0A0A0A | active translate/rotate buttons, local-space button |
| Focus | `--color-focus-ring` | #F7F7F5 | `:focus-visible` outline 2 px, offset 2 px (also spec 07's switches and spec 03's pivot options, 5.12) |
| Status | `--color-success` / `--color-warning` / `--color-danger` | #3DD68C / #FF8640 / #F2555A | frustum status, max distance, 4K warning box, delete/clear hover |

**Why gold goes on the primary CTA and not on the selected-object highlight.**
1. In the brand story, gold marks the moment a decision is committed. In this tool, Export All is the commit: it packages the configuration that leaves the building.
2. There is exactly one primary CTA in the DOM, so "once per layout" holds by construction. A static check enforces it (8.2, R-B5).
3. Selection is a 3D state that applies to arbitrary objects, and with spec 02 possibly to several sections at once. A gold selection would multiply gold moments, compete with the gold point of the logos, and sit next to the RGB gizmo axes.
4. The same reason (5.12) replaces these gold-like colours:
   - the legacy amber frustum `#ffaa00` (ΔE00 7.2 from Pivot Gold);
   - the legacy yellow swatch `#ffdd00` (10.9);
   - the gold-like keys first proposed by sibling specs: spec 01's original vertex-normal yellow `#ffd23f` (7.0), which spec 01 CR-8 has since replaced with lime `#B8F03C` (27.3); spec 02's selection `#ffd400` (8.1); spec 03's selected pivot `#ffdd00` (10.9); spec 04's UV handles `#ffaa00` (7.2).

**The selected state.** In the chrome it is Signal Red (badge bar, borders, active pilot) and white (active tool buttons). In 3D it is a **two-tone outline** (light core over a Morph Black halo, D15): a single red would fall to 1.0:1 on a Signal Red section and 2.39:1 (`#F2555A`) on the Studio Grey default wall, so 3D selection is never a single red line and never gold.

**Why red, but only as graphics.** Signal Red on Morph Black is 3.31:1. That passes WCAG 1.4.11 (non-text, 3:1) and 1.4.3 for large text only. It falls below 3:1 on any surface lighter than #161616:
- 3.03:1 on #161616;
- 2.91:1 on #1A1A1A (the reason the card surface is #161616 and not #1A1A1A);
- 2.76:1 on #1F1F1F;
- 2.69:1 on the translucent overlay chip composited over the default wall (#212121).

Every red **indicator** therefore has an opaque neighbour from `--color-bg-app`, `--color-surface-1` or `--color-surface-2`. In the sidebar that is the surface it sits on. Over the live scene it is an opaque chip (the selection badge) or a 1 px Morph Black outer ring (the badge, the preview-window border, the pilot banner and the active pilot button; 3.5). Red **text** always uses `#F2555A`.

### 3.5 Component states

| Component | Rest | Hover | Active / on | Focus |
|---|---|---|---|---|
| `.toggle` (44×24, knob 18 px at 3 px, geometry unchanged) | track `--color-bg-app` + `box-shadow: inset 0 0 0 1px var(--color-border-strong)` (inset shadow, so the box size does not change), knob `--morph-white-1000` | – | track `--color-accent`, inset shadow `--color-accent`, knob translated 20 px | outline focus ring (once B-L36 makes it focusable) |
| `.mesh-mode-option` | bg `--color-surface-1`, border subtle, radio ring strong | border strong | border `--color-accent`, radio ring + 6 px dot `--color-accent`, bg unchanged (no tint: a tinted bg would drop red below 3:1) | – |
| `.input-field` | bg `--color-surface-1`, border subtle; label 9 px Montserrat 600 uppercase **0.06em** secondary; value JetBrains Mono 14 px primary. The parent `.section-row` gains `align-items: end`, so a label that wraps never misaligns the two inputs of a row (3.1). | – | `:focus-within` border `--color-accent` (3.16:1 vs #111111, 3.03:1 vs #161616) | (same) |
| `.readout` (`.camera-info`, `.frustum-status`) | bg `--color-surface-1`, radius 6 px, 11 px; `.readout-label` secondary (7.49:1), `.readout-value` primary JetBrains Mono 500 (17.60:1); `.status-*` spans use the `--status-*` tokens | – | – | – |
| `.export-btn--primary` (`#export-zip`) | bg `--cta-background`, text `--color-on-cta`, Montserrat 700 12 px uppercase 0.06em | `box-shadow: inset 0 0 0 2px var(--color-on-cta)` (a black inner ring; no lift, no change to the gold, no second gold reference) | – | focus ring |
| `.export-btn.secondary` | bg `--color-surface-2`, border strong, text primary 600 | bg hover, border secondary | – | focus ring |
| `.add-section-btn` | dashed 2 px strong, text secondary | border + text primary, bg surface-2 | – | focus ring |
| `.gizmo-mode-btn`, `.view-btn` | bg overlay chip, border subtle, icon secondary; **all icons 18×18** (the gizmo SVGs had no size rule, so they filled the 40 px button) | border secondary, icon primary | translate/rotate `.active`: bg `--color-control-active-bg`, icon `--color-on-control-active`; `.space.world`: chip bg, border strong, text primary; `.space.local`: like active; `.pilot.active`: bg/border `--color-accent`, icon white (5.98:1), plus `outline: 1px solid var(--color-bg-app)` so the red button keeps a Morph Black edge over any scene content | focus ring; on `.pilot.active` the focus ring takes the outline (`.pilot.active:focus-visible`, which outranks the outline rule) and the Morph Black edge becomes `box-shadow: 0 0 0 1px var(--color-bg-app)` while the focus lasts |
| `.view-btn.active` (`#toggle-grid`; spec 01 adds `#toggle-normals`) | – | – | border strong, icon primary. The rule is spec 01 T7's (07 C52, 2.4 B-L24). T4a maps it to role tokens if it already exists; if 01 T7 lands after T4a, it is written with these roles directly (5.12 rule 4). | focus ring |
| `.pilot-info` | bg `--color-accent` (opaque), border accent, `outline: 1px solid var(--color-bg-app)` (the same Morph Black edge as the badge), text `--color-on-accent` 12 px 600 (5.98:1), + camera SVG; show/hide mechanism unchanged | – | – | – |
| `.selection-indicator` | **opaque** `background: var(--color-surface-1)` (not the translucent overlay chip), border subtle, `border-left: 3px solid var(--color-accent)`, `outline: 1px solid var(--color-bg-app)` (outside the chip, so it changes no rect). The red bar keeps 3.16:1 against the chip and 3.31:1 against the outer ring, over any scene content. `.selected-name` primary 600. | – | – | – |
| `#camera-preview-window` | `border: 1px solid var(--color-accent)` plus `outline: 1px solid var(--color-bg-app)`. The outline is an opaque Morph Black ring outside the red border: it follows `border-radius` and changes no layout, so the `preview_resize` rects stay as they are. The red line therefore always has a Morph Black neighbour (3.31:1), even where the preview content or the scene behind the window is a Signal Red, Steel or Iris section (1.0-1.3:1). `box-shadow: 0 4px 20px rgba(0,0,0,0.6)` (token `--shadow-overlay`), header bar `rgba(10,10,10,0.75)` (token `--color-scrim`) text primary, footer text secondary; resize grip `stroke="currentColor"` with `.preview-window__resize { color: var(--color-text-secondary) }` | – | – | – |
| `.color-swatch-small` (24×24, `flex: none`) | `box-shadow: inset 0 0 0 1px var(--color-swatch-ring)` (rgba(255,255,255,0.1)) so dark swatches stay visible; the same ring on `.section-color` | scale 1.1 (legacy) | **two-tone ring:** `border: 2px solid var(--color-text-primary)` + `box-shadow: inset 0 0 0 1px var(--color-bg-app)`. The light ring stands out on the card (16.87:1); the inset Morph Black ring stands out on the fill. The better of the two is >= 4.37:1 against every palette colour (Iris). A light ring alone would be 1.32:1 on Studio Grey, the swatch that is active at startup. | – |
| `.color-input-custom` | `flex: 1; min-width: 28px` (8 swatches + custom fit in the 340 px card) | – | – | – |
| `.section-warning` (4K) | bg `rgba(255,134,64,0.12)`, border `rgba(255,134,64,0.4)`, text and icon `--color-warning` (6.28:1 on the composited chip over #161616) | – | – | – |
| `.section-delete:hover`, `.section-logo-clear:hover` | – | icon `--color-danger`, bg `rgba(242,85,90,0.12)` (token `--color-danger-bg`): 4.68:1 over #161616, 4.26:1 over #1F1F1F (icons, 3:1 required) | – | – |
| `#toggle-brand-mark` (T10) | standard `.toggle` in a compact `.toggle-container` row directly under the `#export-panel-ids` row of `.export-section`; label "Morph mark on panel-ID PNG"; `title` "Adds the Morph monogram to the bottom-right panel of the combined PNG. Large fixed label sizes can touch it." If spec 07 X1 has landed, it uses X1's switch markup and keys (`role="switch"`, `bindSwitchKeys`, 5.3). | – | as `.toggle` | focus ring |

### 3.6 Typography

- **Brand font.** The Brand Story PDF embeds its text as outlined Type 3 glyphs with no font names, so the family was **identified visually**: geometric sans, double-storey "a", the pointed-vertex M and the R of the wordmark. These match **Montserrat**: SemiBold/Bold for headlines, Regular/Light for body, tracked uppercase SemiBold for eyebrows. Open question Q4 asks the owner to confirm.
- **Loading.** One Google Fonts URL per step, so every canvas/PNG change lands in T5:
  - **T4a** (DOM only; canvas glyphs must not change): `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Montserrat:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap`. The legacy JetBrains Mono 300-600 and Outfit sets are unchanged, so canvas `bold` still resolves to the 600 face and the section label still uses Outfit.
  - **T5** (final): `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&display=swap`. Adding JetBrains Mono 700 changes the panel-ID glyphs in every PNG, which is why it is a T5 change; Outfit and JetBrains Mono 300 are dropped (unused after T5).
  - Self-hosting (OFL-1.1) is follow-up T13.
- **Tokens.** `--font-ui: 'Montserrat', system-ui, sans-serif;` and `--font-mono: 'JetBrains Mono', ui-monospace, monospace;`.

| Use | Family | Weight | Size | Tracking | Case |
|---|---|---|---|---|---|
| Product name | ui | 600 | 15 px | 0.02em | Sentence |
| Section card title | ui | 600 | 14 px | 0 | as typed |
| Body, toggles, options | ui | 400-500 | 12-13 px | 0 | Sentence |
| Eyebrows (`.global-section-title`, `.subsection-title`) | ui | 600 | 11 / 10 px | 0.14em / 0.12em | UPPER |
| Field labels | ui | 600 | 9 px | 0.06em (3.1) | UPPER |
| Buttons | ui | 600 (secondary) / 700 (CTA) | 12 px | 0.06em | UPPER |
| Values, readouts, stats, summaries, info badge | mono | 400-500 | 11-18 px | 0 | – |
| Canvas: panel-ID label | mono | bold (700 loaded from T5) | computed | – | – |
| Canvas: section name on section canvas | ui | bold | computed | – | as typed |
| Canvas: safe-distance label | ui | 600 | 32 px | – | – |

### 3.7 Favicon and app icons (T4b)

```html
<link rel="icon" href="assets/brand/morph-favicon.png" type="image/png" sizes="64x64">
<link rel="icon" href="assets/brand/morph-favicon@2x.png" type="image/png" sizes="128x128">
<link rel="icon" href="assets/brand/morph-favicon.svg" type="image/svg+xml" sizes="any">
<link rel="apple-touch-icon" href="assets/brand/morph-app-icon-dark@2x.png">
```

`<meta name="theme-color" content="#0A0A0A">` and `<meta name="color-scheme" content="dark">` are ungated and land in T4a.

- The favicon artwork has its own Morph Black plate around a white tile, so it reads on light and dark tab strips.
- **Order.** The sized PNGs come first and the SVG last with `sizes="any"`: browsers that support SVG favicons then prefer it, and Chrome does not pick a sized PNG over it. This is not guaranteed by any spec, so the manual Pages check (8.5) confirms which file each browser fetches; the PNGs are the deliberate fallback either way.
- The `@4x` 256 px PNG is not linked.
- The apple-touch-icon uses the 384 px dark app icon. "Use the dark version for show files and control surfaces" fits a control tool. iOS fills its transparent corners black, which matches the plate.
- No web manifest (no PWA scope). Relative paths keep the GitHub Pages sub-path `/LED_Configurator/` working.

### 3.8 3D scene and canvases

| Item | Legacy | New | Token | Note |
|---|---|---|---|---|
| Scene background (main and preview renderer) | 0x0a0a0f | **0x0a0a0a** | `--scene-background` | Morph Black |
| Grid centre lines / lines | 0x2a2a3a / 0x1a1a24 | **0x333333 / 0x1c1c1c** | `--scene-grid-center` / `--scene-grid-line` | neutral, no blue cast; decorative |
| Panel frames | 0x4a4a5a | **adaptive (6.7):** light **0xd4d4d4** or dark **0x0a0a0a** per section | `--scene-frame` (light) / `--scene-frame-on-light` (dark) | Frames always lie on a section, so the frame colour follows the section. With content "colour" and no wireframe, each section's frames take the light or the dark frame, whichever has the higher contrast with that section's colour. That is >= 3.65:1 for **any** colour, and >= 3.77:1 on the palette (Steel). With panel IDs, the LED sim, HDRI content or wireframe, the frames are light: the textures are near-black (13.36:1 on #0A0A0A). A single grey cannot work here: the earlier `#616161` measured 1.04-2.58:1 on 7 of the 8 palette colours, below the legacy `#4a4a5a`, which met 3:1 on 5 of the 8 legacy colours. |
| Camera body | 0xff6600 @ 0.8 | **0xc51622 @ 1.0** + 1 px **0x0a0a0a edge outline** | `--scene-camera-body`, `--scene-overlay-halo` | The point of view is the direction, so it is red. Opaque: 3.31:1 on black and 4.23:1 on the default wall (at 0.9 it would blend to (178, 21, 32), 2.85:1 on black). Red alone is 1.00:1 on a Signal Red section and below 3:1 on 6 other palette colours. The outline (`EdgesGeometry` of the body box, 6.6) is >= 3.31:1 on every palette colour, so the better of fill and outline is >= 3.31:1 on the background and on every palette colour. **Remaining limitation:** a custom section colour darker than 3:1 against black *and* within 3:1 of red (for example `#3a0000`) hides both. This is accepted, because such colours are user choices outside the palette. |
| Frustum lines | 0xffaa00 @ 0.7 | **two-tone (D15):** core **0xf7f7f5** dashed (dash 0.15 m, gap 0.10 m) over a solid halo **0x0a0a0a**, both opaque | `--scene-frustum` / `--scene-overlay-halo` | neutral construction geometry. ≥ 4.37:1 against the background and every palette colour (6.6). A single `#f7f7f5` line at 0.6 opacity composites to about `#ebebe9` over the default wall, 1.18:1, and vanishes exactly where the frustum meets the wall (the prototype's `shot-camera.png`) |
| Frustum fill | 0xffaa00 @ 0.08 | **0xf7f7f5 @ 0.05** | `--scene-frustum` | decorative tint only; the lines carry the information |
| Safe band wall → threshold | [0.2, 1, 0.4] → [1, 0.2, 0.2] | **#3dd68c → #c51622** as `[r/255, g/255, b/255]` | `--scene-safe-wall` / `--scene-safe-threshold` | semantic safe → limit; drawn on the floor (background) |
| Safe line | 0xff4444 @ 0.8 | **0xf2555a @ 0.9** | `--scene-safe-line` | |
| Safe label | '#ff4444', 'bold 32px Arial' | **'#f2555a', "600 32px 'Montserrat', system-ui, sans-serif"** | `--scene-safe-label`, `--font-ui` | 5.87:1 on black |
| Canvas background (panel-ID canvases, LED-sim tiles) | '#0a0a0f' | **'#0a0a0a'** | `--canvas-background` | changes panel-ID PNG pixels |
| Panel-ID border cycle | #ff0000 / #00ff00 / #0000ff | **unchanged** | – | functional R/G/B line-up convention (Q10) |
| Panel label / section-name fonts | 'JetBrains Mono' bold / 'Outfit' bold | `'JetBrains Mono', ui-monospace, monospace` bold / `'Montserrat', system-ui, sans-serif` bold | `--font-mono` / `--font-ui` | |
| Frustum status text | #00ff66 / #ffaa00 / #ff4444 | **#3dd68c / #ff8640 / #f2555a** | `--status-within/off-center/exceeds` (= success/warning/danger) | via `theme.ui.status` (CameraPanel unchanged) |
| Person, car | blue / red-grey | **unchanged** | – | the harness picks the person by `0x4488ff` (Q9); spec 05 replaces the car |
| Gizmo axes | XYZ = RGB | **unchanged** | – | ARCHITECTURE 9 |
| Lights, axes helper | – | unchanged | – | |
| Theme keys added by specs 01-05 | – | per 5.12 | `--scene-*`, `--uv-*` | selection, pivot, normals, wall back, face orientation, HDRI marker, UV viewer |

The prototype (`shot-camera.png`, `shot-panelids.png`) shows these values except the frustum, the camera-body opacity and outline, and the adaptive frames (Prototype notes).

### 3.9 Section default palette (user data)

`Palette.sectionColors` (index = `sections.length % 8` on add; on colour-less import see 4.3). It is lowercase so it equals what `<input type="color">` produces (its value sanitiser lowercases), and swatch `.active` matching stays exact.

| # | Name | Hex | Contrast on #0A0A0A | ΔE00 to Pivot Gold | Note |
|---|---|---|---|---|---|
| 0 | Studio Grey | `#d9d9d6` | 14.00 | 28.6 | **default first section** (`Palette.defaultSectionColor`), neutral "strong geometry"; the wall stands out from Morph Black, which a mid-dark default would not |
| 1 | Signal Red | `#c51622` | 3.31 | 49.7 | the brand red |
| 2 | Sky | `#58a6e8` | 7.57 | 52.1 | |
| 3 | Ember | `#e2803c` | 6.96 | 22.7 | kept ≥ 20 from gold |
| 4 | Jade | `#14a37f` | 6.20 | 41.6 | |
| 5 | Rose | `#e68ac0` | 8.26 | 54.6 | ΔE00 15.7 from the legacy magenta |
| 6 | Iris | `#7462d8` | 4.22 | 67.9 | |
| 7 | Steel | `#6c6c6c` | 3.77 | 39.7 | = Morph Muted (`--morph-neutral-600`). Darker than the prototype's `#7f7f7f`, which sat 6.6 from Jade under deuteranopia |

**Distinctness (6.3 metric, every mode, both palettes).** The palette cycles, so adjacency is cyclic. Simulated colours are kept unrounded.

| Metric (min ΔE00) | Legacy normal | New normal | Legacy protan | New protan | Legacy deutan | New deutan | Legacy tritan | New tritan |
|---|---|---|---|---|---|---|---|---|
| Pairwise | 8.8 | **25.3** | 4.9 | **7.8** | 7.5 | **13.1** | 1.9 | **8.8** |
| Cyclic adjacent | **42.2** | 27.3 | **25.5** | 14.3 | 13.1 | **17.0** | **27.7** | 14.7 |
| vs background `#0a0a0a` | **50.8** | 31.0 | **37.9** | 26.1 | **47.4** | 31.0 | **46.6** | 31.0 |

Gold-like colours (ΔE00 < 20 from Pivot Gold): legacy `#ffdd00` (10.9); new **none**.

**Reading.** The new palette is better on what causes confusion between two sections (the minimum pairwise distance, in every vision mode, and deuteranopia adjacency) and worse on neighbour and background separation, where the legacy neons were extreme (42.2 normal adjacent) and the new values stay well above the U7 floors (≥ 14 adjacent, ≥ 25 background). It also stays legible in the dark UI. It does not dominate the legacy palette on every metric, and D8 no longer claims so.

**Card swatches.** `Palette.cardSwatches = Palette.sectionColors` (all 8, rendered from the palette, not literals). The custom colour input follows.

**Legacy palette.** `Palette.legacySectionColors` (the 8 legacy colours, frozen) is kept **only** to fill missing colours when reading **v1** files (4.3), so an old file looks as it did when it was authored. Existing colours in any file are never changed. It is exempt from U6/U7 (it is import data, not a default).

### 3.10 Keyboard

No shortcuts are added. Existing bindings (G, R, L, P, Escape, WASD, Q/E) are untouched. The header and watermark are not focusable. The `:focus-visible` ring (3.5) applies to every button and select.

### 3.11 Feedback, empty and error states

| Situation | Behaviour |
|---|---|
| A brand SVG fails to load (wrong case on Pages, missing file) | The `<img>` shows its `alt` ("Morph") in `--color-text-primary`; the watermark (`alt=""`) shows nothing. Prevented by static rule R-B4 (8.2). No JS error. |
| Fonts fail to load (offline, blocked) | Fallbacks `system-ui` / `ui-monospace`. Fallback metrics differ from Montserrat, so a long field label may wrap to two lines. `.section-row { align-items: end }` keeps the inputs of a row aligned, and only that card grows. Nothing overlaps. Canvas text falls back the same way. |
| A canvas was drawn while a font face needed for its text was still loading | The font gate (5.6) loads exactly the pending (font, text) pairs and redraws the panel-ID canvases once when they arrive, so section names in a not-yet-loaded subset (for example latin-ext) are covered too. Two cases wait for the next rebuild: text drawn after the gate has settled, and the safe-distance label, which is redrawn on the next camera change (documented limitations, 5.6). |
| A CSS token is missing or malformed when `App` starts | ThemeBridge uses the `Theme.js` fallback for every leaf bound to that variable and calls `warn` **once per variable name** with exactly: `ThemeBridge: --scene-frame is missing or invalid ("…"); using the Theme.js fallback`. The app runs. The unit parity test (8.1, U4) prevents this in practice. |
| Stylesheet not applied before `main.js` | Cannot happen with `<link>` in `<head>`: module scripts are deferred, and deferred scripts run only once the document has no script-blocking style sheet. If it did happen, every token would be missing and the fallbacks are identical to the CSS values (U4), so the result is visually the same. |
| Brand mark for the PNG export not ready, too small, or colliding with a section logo in both corners | The export proceeds without the mark (6.5). |
| Owner has not approved publishing assets | T4b and the README lockups (T9) are blocked. T4a already ships the text-only header ("Morph LED Configurator"), with no watermark and no favicon (Q2). |

### 3.12 Accessibility: contrast of every pair introduced (WCAG 2.2 relative luminance)

| Foreground | Background | Ratio | Required | Use |
|---|---|---|---|---|
| #F7F7F5 text-primary | #0A0A0A / #111111 / #161616 / #1F1F1F | 18.46 / 17.60 / 16.87 / 15.37 | 4.5 | all body text; `.readout-value` on `.readout` (#111111) |
| #A3A3A3 text-secondary | #0A0A0A / #111111 / #161616 / #1F1F1F | 7.85 / 7.49 / 7.17 / 6.53 | 4.5 | labels, hints, info badge, `.readout-label` |
| #6C6C6C text-disabled | #161616 | 3.45 | exempt | disabled only, never informative |
| #F2555A accent-text / danger | #0A0A0A / #161616 / #1F1F1F | 5.87 / 5.36 / 4.88 | 4.5 | small red text |
| #F2555A danger icon | danger chip `rgba(242,85,90,0.12)` over #161616 / #1F1F1F | 4.68 / 4.26 | 3 (icon) | delete / clear hover |
| #3DD68C success | #111111 / #161616 | 10.07 / 9.65 | 4.5 | status, max distance |
| #FF8640 warning | #111111 / #161616; warning chip over #161616 | 7.86 / 7.53; 6.28 | 4.5 | status, 4K warning |
| #FFFFFF on-accent | #C51622 | 5.98 | 4.5 | pilot banner, active pilot icon |
| #0A0A0A on-cta | #F2B705 | 10.89 | 4.5 | Export All |
| #0A0A0A on-control-active | #F7F7F5 | 18.46 | 4.5 / 3 | active tool icon |
| #C51622 accent (graphic) | #0A0A0A / #111111 / #161616 | 3.31 / 3.16 / 3.03 | 3 (1.4.11) | toggle track, radio dot, focus/selected borders |
| #C51622 accent (graphic) | #1F1F1F | 2.76 | – | **forbidden pairing** (no red indicator on hover surfaces) |
| #F7F7F5 focus ring | any surface | ≥ 15.37 | 3 | focus |
| #C51622 selection-badge bar | opaque chip #111111 / outer ring #0A0A0A | 3.16 / 3.31 | 3 | badge over any scene content |
| #C51622 preview-window border, pilot banner, active pilot button | outer ring #0A0A0A | 3.31 | 3 | over any scene content |
| #C51622 on the translucent overlay chip | composited over #D9D9D6 / #FFFFFF (#212121 / #242424) | 2.69 / 2.60 | – | **forbidden pairing**: the reason the badge is opaque |
| #F7F7F5 / #A3A3A3 text on the overlay chip | worst composite (#242424, over white) | 14.47 / 6.15 | 4.5 | view buttons, info badge |
| Active swatch: #F7F7F5 border + #0A0A0A inset ring | card #161616; each palette fill (better of the two rings) | 16.87; ≥ 4.37 (Iris) | 3 | active swatch |
| Adaptive frame (#D4D4D4 or #0A0A0A, the better one) | each palette colour; any colour; #0A0A0A (texture content, light frame) | ≥ 3.77 (Steel); ≥ 3.65; 13.36 | 3 | 3D frames (6.7) |
| #C51622 camera body, HDRI marker (solid meshes) with #0A0A0A edge outline | #0A0A0A / #D9D9D6 / each palette colour (better of fill and outline) | 3.31 / 4.23 / ≥ 3.31 (Signal Red, via the outline) | 3 | 3D |
| Two-tone overlays (core / halo #0A0A0A): frustum, selection primary and hover, pivot, UV wire (core #F7F7F5) | worst of {#0A0A0A, each palette colour}, taking the better of core and halo | 4.37 (Iris) | 3 | 6.6 |
| Two-tone overlays: selection secondary (#A3A3A3), pivot selected (#C51622) | same | 3.31 | 3 | 6.6 |
| Single #F7F7F5 line @ 0.6 (rejected design) | #D9D9D6 default wall | 1.18 | – | documents why D15 exists |
| Single #616161 frame (rejected design) | Signal Red / Steel / Iris / Jade / Ember / Sky / Rose | 1.04 / 1.18 / 1.32 / 1.94 / 2.18 / 2.37 / 2.58 | – | documents why frames are adaptive |
| #F2555A safe label | #0A0A0A | 5.87 | 3 (large) | 3D label |

Borders `#262626`/`#333333` are decorative (≤ 1.6:1). Inputs are identified by their persistent label and value text, as in legacy; known limitation, not a regression.

---

## 4. Data model

### 4.1 Domain (pure)

| Change | Spec |
|---|---|
| `WallSection.createDefault({ color = '#d9d9d6' } = {})` | Same field object as today, with `color` taken from the argument. The literal default exists only so `new Wall()` works in Node tests; unit test U8 asserts it equals `Theme.palette.defaultSectionColor`. |
| `Project.createDefault({ defaultSectionColor } = {})` | `new Project({ wall: new Wall({ sections: [WallSection.createDefault({ color: defaultSectionColor })] }), … })`. With `undefined`, the `createDefault` default applies. |
| `PanelIdStyle.brandMarkOnExport = false` (T10, optional) | Boolean, stored by `PanelIdStyle.set('brandMarkOnExport', value)` (no RULES entry; `value === true` is stored as `true`, anything else as `false`). Persisted (not view-only): it is an export preference of the project. The domain field is camelCase like every `PanelIdStyle` field; its JSON key is `brand_mark_on_export` (4.2). |

No other domain field changes. Section colours remain free strings until spec 07's `setColor` hex rule (B-M4 defence in depth) lands.

### 4.2 Project JSON v2 fields (spec 07 revision 2 is authoritative)

The v2 envelope, key style, key order, versioning and extension rules are spec 07's (section 0 C1, C2, C10, C11; 4.2-4.6):
- keys are snake_case and every v1 key stays in place;
- the version is `"version": "2.<revision>"` plus `"format": "morph-led-project"`, and there are no `schemaVersion` or `schemaRevision` keys;
- the first three keys are `version`, `generator`, `format`;
- project files carry no timestamp.

This spec owns only what spec 07 reserves for F6 (4.4 item 1): the value of `generator`, and `panel_id_style.brand_mark_on_export`.

| JSON path (spec 07 naming) | Type | Written value | Default when missing | Validation on read | Owner |
|---|---|---|---|---|---|
| `generator` (**2nd key**) | object `{ name, version }`, keys in that order | `{ name: brand.jsonGenerator.name, version: appVersion }` | – | derived key: ignored on read, never echoed (spec 07 C10, 4.2 "Derived keys") | F6 (value), P (writer) |
| `generator.name` | string | `"Morph LED Configurator"` from T6a; `"LED Wall Configurator"` before | – | ignored | F6 |
| `generator.version` | string | `APP_VERSION` from `js/core/AppInfo.js` (spec 07 D1), e.g. `"2.0.0"` | – | ignored | P |
| `panel_id_style.brand_mark_on_export` (T10) | bool | `project.panelIdStyle.brandMarkOnExport` | `false` (absent means default, no issue raised) | non-boolean → `false` + warning (spec 07 4.3 row) | F6 |

- **Position.** `generator` is the **2nd** key of the file (`version`, `generator`, `format`, …), in every variant (spec 07 C2, C10). `brand_mark_on_export` is the last key of `panel_id_style`, after `section_label_color`, as in spec 07's 4.2 skeleton.
- **`Brand.jsonGenerator`** (new, 5.4) is `Object.freeze({ name: 'Morph LED Configurator' })`, the name half of the record. The version is not in `Theme`, because `theme/` may not import `core/AppInfo.js` (ARCHITECTURE 1.3). Every writer of a generator record composes `{ name: brand.jsonGenerator.name, version: appVersion }` in that key order, with `appVersion` injected by `App` from `APP_VERSION`. That is exactly the dependency pair spec 07 5.5.1 declares (`ProjectSerializer({palette, brand: {jsonGenerator}, appVersion, limits})`). Spec 09's stage-pack manifest and spec-sheet generator use the same composition, `{name: brand.jsonGenerator.name, version: APP_VERSION}` (07 C62). There is no second version constant. **Whichever of spec 07 D4 and this spec's T6a lands first adds the key:** D4 adds it with the Phase-1 product name (`{ name: 'LED Wall Configurator' }`), and T6a sets the Morph name. U9 asserts `Brand.jsonGenerator.name === Brand.productName` and `Object.keys(Brand.jsonGenerator)` equal to `['name']`.
- **No revision bump for `generator`.** Spec 07 D4 already writes `generator` in `"2.0"`, and its value is derived; derived and write-only keys never bump (07 C40). Changing the name in T6a changes the JSON outputs but not the schema.
- **Extension protocol for `brand_mark_on_export`** (spec 07 4.4 items 3-5):
  - the `io/ProjectSchema.js` row (spec 07 4.3 already reserves the path);
  - the key is **absent until T10** (07 C39); T10 is F6's **one** revision bump, whose number is assigned at merge time and recorded in `ProjectSchema.REVISIONS` (n → `['panel_id_style.brand_mark_on_export']`), with `KNOWN_REVISION` set to it (07 C40);
  - "absent means default", with no issue raised;
  - a round-trip unit test and a case in spec 07's reachability property test (8.1).

  It is **not view-only**, so the `history` and `autosave` variants carry it, and it has a History record row (5.7, `WallController.setBrandMarkOnExport`).
- **Timestamps.** None. Spec 07 C10 removed `savedAt` from project files; only the autosave envelope (spec 07 4.8) carries `saved_at`, and that envelope is never exported. No clock injection or comparer mask is needed for this spec's outputs.
- **Before spec 07 D4 lands**, the Phase-1 v1 writer has no `generator` field and this spec adds none; only the v1 colour fill of 4.3 applies.

### 4.3 Migration and import semantics

| Input | Result |
|---|---|
| v1 file (no `format`) | Read as today. **Missing section colours** are filled from `Palette.legacySectionColors[i % 8]` (the Phase-1 legacy behaviour, now explicit). Before spec 07 D3 this is the Phase-1 `ProjectSerializer.read` v1 path (T7). After D3 it is spec 07's `migrateV1toV2(data, { palette })`, whose mapping row already reads `colors = palette.legacySectionColors ?? palette.sectionColors` (spec 07 C11 and 4.6). **No amendment is needed**; T8 only verifies it. |
| v2 file with a section without `color` | spec 07 validator default `Palette.sectionColors[i % 8]` (spec 07 4.3 row, C11) |
| v2 file with `generator` from any app | `generator` is a derived key: ignored on read and never echoed (the writer always writes its own) |
| v2 file without `panel_id_style.brand_mark_on_export` | `false`, no issue |
| v2 file with a newer minor version than `KNOWN_REVISION` | spec 07's `newer-revision` warning; unknown keys dropped (spec 07 4.4 item 4) |
| Any file with colours | colours kept verbatim; branding never recolours user data |

`ProjectSerializer` (Phase 1) constructor deps stay `{ palette }`, where `palette` now also carries `legacySectionColors`. Until spec 07's v2 dispatch exists, every file is read by the v1 branch, so imported colour-less sections keep their legacy colours (the `concave_offsets` harness config stays unchanged).

---

## 5. Architecture

### 5.1 `css/02-tokens.css` (complete content after T5)

```css
:root {
  /* 1. Brand primitives: Morph Colour Guidelines v2.1. Alias targets only. */
  --morph-black-950: #0A0A0A;
  --morph-red-600: #C51622;
  --morph-white-1000: #FFFFFF;
  --morph-gold-500: #F2B705;
  --morph-neutral-50: #F7F7F5;
  --morph-neutral-600: #6C6C6C;
  --morph-neutral-200: #D4D4D4;

  /* 2. Derived dark-UI primitives (this app only; never used in logos). */
  --ui-grey-930: #111111;
  --ui-grey-910: #161616;
  --ui-grey-880: #1F1F1F;
  --ui-grey-850: #262626;
  --ui-grey-800: #333333;
  --ui-grey-400: #A3A3A3;
  --ui-red-400: #F2555A;
  --ui-green-400: #3DD68C;
  --ui-orange-400: #FF8640;

  /* 3. Semantic UI roles. Components reference only these. */
  --color-bg-app: var(--morph-black-950);
  --color-surface-1: var(--ui-grey-930);
  --color-surface-2: var(--ui-grey-910);
  --color-surface-hover: var(--ui-grey-880);
  --color-surface-overlay: rgba(17, 17, 17, 0.92);
  --color-scrim: rgba(10, 10, 10, 0.75);
  --color-border-subtle: var(--ui-grey-850);
  --color-border-strong: var(--ui-grey-800);
  --color-text-primary: var(--morph-neutral-50);
  --color-text-secondary: var(--ui-grey-400);
  --color-text-disabled: var(--morph-neutral-600);
  --color-accent: var(--morph-red-600);
  --color-on-accent: var(--morph-white-1000);
  --color-accent-text: var(--ui-red-400);
  --cta-background: var(--morph-gold-500);   /* exactly one consumer: .export-btn--primary */
  --color-on-cta: var(--morph-black-950);
  --color-control-active-bg: var(--morph-neutral-50);
  --color-on-control-active: var(--morph-black-950);
  --color-focus-ring: var(--morph-neutral-50);
  --color-success: var(--ui-green-400);
  --color-warning: var(--ui-orange-400);
  --color-warning-bg: rgba(255, 134, 64, 0.12);
  --color-warning-border: rgba(255, 134, 64, 0.4);
  --color-danger: var(--ui-red-400);
  --color-danger-bg: rgba(242, 85, 90, 0.12);
  --color-swatch-ring: rgba(255, 255, 255, 0.1);
  --shadow-overlay: 0 4px 20px rgba(0, 0, 0, 0.6);
  --font-ui: 'Montserrat', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* 4. Scene and canvas roles: read by theme/ThemeBridge.js. Values must be #rrggbb
        (or rgba(r, g, b, a) for 'css'-kind bindings, 5.5). */
  --scene-background: var(--morph-black-950);
  --scene-grid-center: #333333;
  --scene-grid-line: #1C1C1C;
  --scene-frame: var(--morph-neutral-200);        /* light frame: dark sections and texture content (6.7) */
  --scene-frame-on-light: var(--morph-black-950); /* dark frame: light sections (6.7) */
  --scene-camera-body: var(--morph-red-600);
  --scene-frustum: var(--morph-neutral-50);
  --scene-overlay-halo: var(--morph-black-950);   /* halo of every two-tone overlay and edge outline (D15) */
  --scene-safe-wall: var(--ui-green-400);
  --scene-safe-threshold: var(--morph-red-600);
  --scene-safe-line: var(--ui-red-400);
  --scene-safe-label: var(--ui-red-400);
  --canvas-background: var(--morph-black-950);
  --status-within: var(--color-success);       /* also used by .status-ok */
  --status-off-center: var(--color-warning);   /* also used by .status-pending */
  --status-exceeds: var(--color-danger);
  /* + the sibling-spec tokens of 5.12, each added together with its Theme key. */
}
```

Rules:
- Components reference only layer 3 (and `--morph-white-1000` for the toggle knob). Layer 4 is read by ThemeBridge; the `--status-*` tokens are also used by the `.status-*` classes, so the initial and runtime status colours come from one token.
- The brand light-theme slide tokens (`--color-slide-*`) are not imported: the app has no light theme.
- Layers 1-3 arrive in **T4a** together with the brand values. The legacy names (`--bg-primary` … `--glow-cyan`) and every remaining CSS colour literal are removed in that same step (R-B1, R-B3a). A legacy-valued role layer would need extra temporary tokens wherever one legacy token served several final roles (for example `--accent-cyan` for focus, toggles, values and hovers); that is not worth the cost.
- Layer 4 arrives earlier, in T3, holding the legacy values (`--scene-background: #0a0a0f`, `--scene-frame: #4a4a5a`, …, `--status-off-center: #ffaa00`), so wiring the bridge is provably non-observable. T5 switches layer 4 to the values shown above and adds `--scene-overlay-halo` and `--scene-frame-on-light` together with their Theme keys.

### 5.2 Stylesheet changes per file

**css-slices.** From T1 on, `css/01-12` are no longer slices of the original. This spec follows **spec 07 S7**, the single cross-spec rule (07 C52): `tests/static/css-slices.mjs` runs with `--report-only`, scoped to `css/01-12`, from the first intentional CSS change.
- If spec 07 E1 (or a spec 01 step) has already made that switch, T1 changes nothing.
- Otherwise T1 makes it, with the S7 amendment of ARCHITECTURE 10.
- The script is not deleted.

**Stylesheet order** (the one link order of 07 C52). The numeric prefix is the link order:
1. `00-fonts.css` (T13, when self-hosting lands);
2. `01-11`;
3. `css/features/*.css` (specs 01-05, including spec 01's `debug-view.css`), before `12-responsive.css`;
4. `12-responsive.css`;
5. spec 09's `20-29` block;
6. this spec's **`css/99-utilities.css`**, last of all.

`99-utilities.css` holds only the utility classes of 5.3, applied only to legacy elements. Feature and spec 09 sheets style their own new selectors, so no sheet linked before it sets the same property on the same element.

| File | Change |
|---|---|
| `01-reset.css` | No change. The `<h1>` reset (`margin: 0; font: inherit`) lives in `.brand-lockup` (04-header.css), not in a global rule. |
| `02-tokens.css` | 5.1. |
| `03-layout.css` | `body` font `var(--font-ui)`, colours via roles. The `:focus-visible` ring of 3.5 (`button`, `select`, `.toggle`: 2 px `--color-focus-ring`, offset 2 px; T4a), the one rule B-L36 and spec 07 3.9 rely on (2.4). |
| `04-header.css` | Delete `.logo`, `.logo-icon`, `.logo-text`, `.logo-text span`. Add `.brand-lockup`, `.product-name` (T4a), `.brand-wordmark`, `.brand-monogram`, `.brand-divider` (T4b). Restyle `.stat-value` and `.stat-label` (3.2). |
| `05-control-panel.css` | Roles per 3.4/3.5. Delete the cyan `rgba()` hovers. `.section-row` gains `align-items: end`; `.input-field label` tracking becomes 0.06em (3.1, T4a). |
| `06-controls.css` | Toggles, mesh-mode, section-title bar. The **first** `.export-btn` block becomes the neutral base (no gradient). Add `.export-btn--primary` (gold). |
| `07-viewport.css` | Delete dead `.grid-lines` (T1, with the commented-out `.grid-lines` element of the markup, as the T1 rows of section 10 and 8.4 say: "dead CSS removed") and `.company-logo` (T4a). Add `.brand-watermark` and `.pilot-info.visible ~ .brand-watermark` (T4b). Info badge chip. |
| `08-section-logos.css` | Roles. |
| `09-viewport-tools.css` | Gizmo/view buttons and their icon size, pilot banner, selection badge (opaque chip + outer ring, and the `bottom: 64px` stacking above the help badge, T4a, 2.4: `bottom: calc(anchor(--help-badge top, 52px) + 12px)` after the `bottom: 64px` fallback, with `anchor-name: --help-badge` on `.viewport-info` in `07-viewport.css`, which is 64 px while the help text fits on one line). `.view-btn.active` is spec 01 T7's rule (in its `css/features/debug-view.css`); T4a only maps it to role tokens. |
| `10-section-extras.css` | Delete dead `.section-color-0..7` (T1). Swatch `flex: none` + inset ring; the active swatch's two-tone ring; custom input `flex: 1`. Warning tokens. |
| `11-export.css` | The second `.export-btn` block keeps only layout (`flex: 1; padding: 12px; font-size: 12px; letter-spacing: 0.06em`). Secondary roles. T10: `.toggle-container--compact` for `#toggle-brand-mark`. |
| `12-responsive.css` | + hide the divider and visually hide the name ≤ 900 px (T4b; T4a leaves the text-only name visible); + `@media (max-width: 520px)` wordmark ↔ monogram (T4b). |
| new `99-utilities.css` | The classes that replace inline styles (5.3). Linked **last** (order above). That is safe because the utilities only set spacing and typography properties that the media query and the feature sheets never set on these elements. Linking last also leaves the media query file untouched. The name does not collide with the `css/features/` sheets of specs 01-05, or spec 09's `20-29` block. |

### 5.3 Markup changes (`index.html`)

**Head (T4a, ungated).**
- Valid `<meta name="author" content="Joe Loe">`.
- `<meta name="description" content="Morph LED Configurator: design curved and multi-section LED walls and virtual-production stages in the browser.">`.
- `theme-color`, `color-scheme`, `<title>Morph LED Configurator</title>`, the T4a font URL (3.6).
- Open Graph without the image:

  ```html
  <meta property="og:title" content="Morph LED Configurator">
  <meta property="og:description" content="Design curved and multi-section LED walls and virtual-production stages in the browser.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://itzmorphinetime.github.io/LED_Configurator/">
  <meta name="twitter:card" content="summary">
  ```

**Head (T4b, gated).** The favicon links of 3.7 and `<meta property="og:image" content="https://itzmorphinetime.github.io/LED_Configurator/assets/brand/morph-app-icon-dark@2x.png">` (`og:image` must be absolute).

**Header.** Lines 875-878 become, in T4a:

```html
<h1 class="brand-lockup">
    <span class="product-name">Morph LED Configurator</span>
</h1>
```

and in T4b:

```html
<h1 class="brand-lockup">
    <img class="brand-wordmark" src="assets/brand/morph-wordmark-dark.svg" alt="Morph" width="507" height="147" decoding="async">
    <img class="brand-monogram" src="assets/brand/morph-monogram-dark.svg" alt="Morph" width="233" height="172" decoding="async">
    <span class="brand-divider" aria-hidden="true"></span>
    <span class="product-name">LED Configurator</span>
</h1>
```

**Overlay.** T4a deletes 1256-1266. T4b inserts after `#pilot-info`, and before spec 07's `#viewport-top-stack` when that exists (07 C51):

```html
<img class="brand-watermark" src="assets/brand/morph-monogram-dark.svg" alt="" aria-hidden="true" width="233" height="172">
```

**Pilot banner and preview header (T4a).** Emoji replaced by inline SVG (3.1).

**Preview resize grip (T4a).** Line 1188 `stroke="var(--accent-cyan)"` becomes `stroke="currentColor"`; the colour comes from `.preview-window__resize` (3.5). T1 leaves the attribute untouched (it is not a `style` attribute, and T1 must be pixel-identical).

**Primary CTA (T4a).** `<button class="export-btn export-btn--primary" id="export-zip">Export All (ZIP)</button>`.

**T10.** Under the `#export-panel-ids` row of `.export-section`. If spec 07 X1 has landed, the toggle uses X1's switch markup (spec 07 3.9), and `ExportPanel.bind()` calls `bindSwitchKeys(el)`:

```html
<div class="export-row export-row--option">
    <div class="toggle-container toggle-container--compact">
        <span class="toggle-label" id="toggle-brand-mark-label">Morph mark on panel-ID PNG</span>
        <div class="toggle" id="toggle-brand-mark" role="switch" tabindex="0" aria-checked="false"
             aria-labelledby="toggle-brand-mark-label" title="…(3.5)"></div>
    </div>
</div>
```

Before X1, the markup is the legacy `div.toggle` without `role`, `tabindex`, `aria-*` and the label `id`, like the 9 existing toggles (B-L36). X1 then converts it together with them, and X1's list of switches gains `#toggle-brand-mark`.

**Inline styles → classes (T1).** Every inline `style` attribute is replaced by classes, **except** JS-owned state:
- the initial `display: none` of `#led-sim-options`, `#panel-id-options`, `#camera-preview-options`, `#custom-filmback`, `#person-options`, `#car-options` and `#export-safe-distance`;
- `display`, `width` and `height` on `#camera-preview-window` (written by `PreviewWindow`);
- the inline `width: 100%; height: 100%` of `#camera-preview-canvas`, which `renderer.setSize` overwrites with pixel sizes (the `preview_resize` scenario records `canvas.style.width`, so the attribute stays exactly as it is);
- in the `SectionLogosPanel` template, the file input's `display: none`.

Class set (in `99-utilities.css`; values copied from the inline styles so T1 is pixel-identical):

| Class | Declarations (from) | Count |
|---|---|---|
| `.mt-6`, `.mt-10`, `.mt-12`, `.mt-16` | `margin-top: 6/10/12/16px` | `.mt-10` ×9 standalone + 3 in composites (`#reset-camera`, `#person-options`, `#car-options`); `.mt-12` ×2; `.mt-16` ×1; `.mt-6` ×1 (`#export-safe-distance`) |
| `.mb-8`, `.mb-10` | `margin-bottom: 8/10px` | ×6, ×2 |
| `.section-row--flush` | `margin-top: 10px; margin-bottom: 0` | 1 |
| `.ui-select` | the 2 select styles (1004, 948) | 2 |
| `.color-input-full` | `width: 100%; height: 30px; cursor: pointer` | 2 |
| `.subsection-title` (existing class, no CSS rule today) | `margin: 14px 0 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary)`; `.subsection-title--tight` `margin-top: 6px` (only "Camera Rotation", 1063) | 3 |
| `.readout` | `margin-top: 10px; padding: 10px; background: var(--bg-secondary); border-radius: 6px; font-size: 11px` | 2 |
| `.readout-row`, `.readout-row--gap`, `.readout-row--last` | flex rows (`margin-bottom: 4px` / `8px` / none) | 7 |
| `.readout-label`, `.readout-value` | `color: var(--text-secondary)` / `color: var(--accent-cyan)` | 7 / 5 |
| `.btn-block` | `width: 100%` | 2 |
| `.preview-window`, `.preview-window__resize`, `.preview-window__icon`, `.preview-window__header`, `.preview-window__footer` | the static parts of 1185-1196 (the canvas keeps its inline size, see above) | 5 |
| `.logo-row`, `.logo-row__title`, `.logo-row__label`, `.logo-row__input` | the script-template styles 2200 (`sectionDiv.style.cssText` → `className = 'logo-row'`), 2202, 2215/2229, 2232 (the scale number input) (template edit in `SectionLogosPanel`) | 4 |
| `.curve-hint--small` | `font-size: 9px` (the card template's offset hint, 3963, edit in `SectionListPanel`) | 1 per card |

Positional harness selectors (`#camera-preview-window > div`, `.camera-info > div`, …) keep matching because no element is added or removed in T1. `#frustum-status-text` and `#safe-distance` keep their ids. Their static initial colours move to classes:
- `#frustum-status-text`: `class="status-pending"`, where `.status-pending` is the legacy initial `#ffaa00` in T1 and `var(--status-off-center)` from T3 (same value until T5);
- `#safe-distance`: `class="status-ok"`, where `.status-ok` is `#00ff66` in T1 and `var(--status-within)` from T3.

`.readout-value` goes only on the 5 spans that were cyan (`#camera-hfov`, `#camera-vfov`, `#camera-aspect`, `#frustum-width`, `#frustum-height`), so no element carries two colour classes.

At runtime `CameraPanel` still writes `statusEl.style.color = theme.ui.status[...]` (5.7). That write is JS-owned state and outside R-B2, which scans only the `index.html` markup.

T1's utility classes may hold the legacy colour literals copied from the inline styles. T4a replaces them, and every other CSS colour literal, with role tokens. R-B1 is enabled at the end of T4a.

The inline `background: #000; border: 2px solid var(--accent-cyan); box-shadow: …` of `#camera-preview-window` moves to `.preview-window` in T1 with its legacy values. T4a restyles it (3.5). `display`, `width` and `height` stay inline, because `PreviewWindow` owns them.

**Specificity.** An inline style beat every rule; a utility class does not. Two measures restore that:
- `99-utilities.css` is linked last, so a utility wins over any earlier single-class rule (`.section-row { margin-bottom: 12px }` vs `.mb-8`; `.section-row` vs `.section-row--flush`; `.curve-hint` vs `.curve-hint--small`).
- Where a legacy rule is more specific than one class (`.input-field input`, `.global-section`, `.export-btn.secondary`), the utility is qualified to the same specificity, for example `.input-field .color-input-full`.

The harness proves the result: computed styles must stay identical.

### 5.4 `js/theme/Theme.js` (values after T5–T7; same shape plus the listed keys)

```js
export const SceneTheme = Object.freeze({
  background: 0x0a0a0a,
  grid: { size: 50, divisions: 50, centerColor: 0x333333, color: 0x1c1c1c, position: [12.5, 0, 12.5] },  // spec 03 step D may move position
  axesSize: 0.5,
  lights: { ambient: { color: 0xffffff, intensity: 0.3 }, point: { color: 0xffffff, intensity: 0.8, position: [5, 5, 10] } },
  frame: 0xd4d4d4,                                                                         // light frame (6.7)
  frameOnLight: 0x0a0a0a,                                                                  // NEW (T5): dark frame for light sections (6.7)
  cameraBody: { color: 0xc51622, opacity: 1.0, outlineColor: 0x0a0a0a },                   // outlineColor NEW (T5)
  frustumLines: { color: 0xf7f7f5, haloColor: 0x0a0a0a, opacity: 1.0, dashSize: 0.15, gapSize: 0.10 },   // haloColor, dashSize, gapSize NEW (T5)
  frustumFill: { color: 0xf7f7f5, opacity: 0.05 },
  safeZone: { wallColor: [0x3d / 255, 0xd6 / 255, 0x8c / 255], thresholdColor: [0xc5 / 255, 0x16 / 255, 0x22 / 255],
              floorOpacity: 0.5, lineColor: 0xf2555a, lineOpacity: 0.9, labelColor: '#f2555a',
              labelFont: "600 32px 'Montserrat', system-ui, sans-serif" },
  person: { body: 0x4488ff, dark: 0x2244aa, opacity: 0.85 },                               // unchanged (D12)
  car: { body: { color: 0xff4444, opacity: 0.85 }, dark: { color: 0x222222, opacity: 0.9 },
         glass: { color: 0x88ccff, opacity: 0.5 }, lights: 0xffffaa },                     // unchanged (D12)
  gizmo: { x: 0xff4444, y: 0x44ff44, z: 0x4444ff, idleOpacity: 0.35, hoverOpacity: 1.0, dimmedOpacity: 0.15 }, // never branded
  // wallBack, debug (spec 01), selection (spec 02), pivot (spec 03), hdri (spec 05): added by those specs with the values of 5.12
  // (spec 01's keys keep spec 01's CR-8 values; F6 binds them and changes none)
});
export const CanvasTheme = Object.freeze({
  background: '#0a0a0a',
  panelBorderColors: ['#ff0000', '#00ff00', '#0000ff'],                                    // unchanged (D12)
  panelLabelFont: (px) => `bold ${px}px 'JetBrains Mono', ui-monospace, monospace`,
  panelSectionNameFont: (px) => `${px}px 'JetBrains Mono', ui-monospace, monospace`,
  sectionLabelFont: (px) => `bold ${px}px 'Montserrat', system-ui, sans-serif`,
  sectionLabelAlpha: 0.6,
  logoAlpha: 0.8,
  preloadFonts: ["bold 32px 'JetBrains Mono'", "32px 'JetBrains Mono'", "bold 32px 'Montserrat'", "600 32px 'Montserrat'"],   // NEW (T5)
});
export const UiColors = Object.freeze({ status: { within: '#3dd68c', offCenter: '#ff8640', exceeds: '#f2555a' } });
const SECTION_COLORS = Object.freeze(['#d9d9d6', '#c51622', '#58a6e8', '#e2803c', '#14a37f', '#e68ac0', '#7462d8', '#6c6c6c']);
export const Palette = Object.freeze({
  sectionColors: SECTION_COLORS,
  cardSwatches: SECTION_COLORS,                                                              // same array (U7: ===)
  defaultSectionColor: '#d9d9d6',
  legacySectionColors: Object.freeze(['#00f0ff', '#ff00aa', '#00ff66', '#ff6b35', '#ffdd00', '#aa66ff', '#66ffaa', '#ff6666']),  // NEW: v1 import only
});
const PRODUCT_NAME = 'Morph LED Configurator';
const FILE_PREFIX = 'morph-led-wall';
export const Brand = Object.freeze({
  productName: PRODUCT_NAME,
  jsonGenerator: Object.freeze({ name: PRODUCT_NAME }),                                      // NEW (4.2): writers add version: appVersion
  shortName: 'LED Configurator',                                                             // NEW
  company: 'Morph',                                                                          // NEW
  homepage: 'https://itzmorphinetime.github.io/LED_Configurator/',                           // NEW
  filePrefix: FILE_PREFIX,                                                                   // NEW (T6b): spec 07 R4's <prefix>, spec 09's brandFilePrefix
  objHeader: '# Morph LED Configurator - LED wall OBJ export\n',
  objGeneratorLine: '# Generated by Morph LED Configurator\n\n',
  mtlHeader: '# Morph LED Configurator - LED wall materials\n\n',
  gltfGenerator: 'Morph LED Configurator',
  safeDistanceObjHeader: '# Safe Distance Floor Mesh\n# Exported from Morph LED Configurator\n\n',
  files: Object.freeze({                                                                     // all derived from FILE_PREFIX (U9)
    json: `${FILE_PREFIX}.json`, obj: `${FILE_PREFIX}.obj`, mtl: `${FILE_PREFIX}.mtl`, gltf: `${FILE_PREFIX}.gltf`,
    zip: `${FILE_PREFIX}-export.zip`, panelIdsPng: `${FILE_PREFIX}-panel-ids.png`,
    safeDistanceObj: `${FILE_PREFIX}-safe-distance.obj`,
    hdriPixelMap: `${FILE_PREFIX}-hdri-pixel-map.png`,                                       // NEW: spec 05
  }),
  assets: Object.freeze({ monogramDark: 'assets/brand/morph-monogram-dark.svg', favicon: 'assets/brand/morph-favicon.svg' }),  // NEW (T10)
});
export const Theme = Object.freeze({ scene: SceneTheme, canvas: CanvasTheme, ui: UiColors, palette: Palette, brand: Brand });
// + uv (spec 04) when it lands, with the values of 5.12
```

- All nested objects and arrays stay deep-frozen; the font-helper functions stay unfrozen (ARCHITECTURE 3.4).
- OBJ/MTL comment strings are ASCII only (hyphen, not an em dash), because several OBJ importers read files as Latin-1.
- `# Mesh Mode: ${meshMode}\n` stays between `objHeader` and `objGeneratorLine`.
- **Per-step content.**
  - **T6a** changes only the strings: `productName`, `jsonGenerator.name`, the headers and `gltfGenerator`. It adds `shortName`, `company`, `homepage` and `jsonGenerator` if spec 07 D4 has not already added the last one (4.2).
  - **T6b** adds `filePrefix` and switches `files` to the names derived from it, plus `hdriPixelMap`. The prefix and the file names therefore appear in one commit, and no export is ever named `morph-led-wall-*` next to `led-wall-config.json`.
- **Users of the prefix.**
  - Spec 07 R4 names its camera-frame PNG `<prefix>-camera-…png` with "Filename prefix from Brand (Feature 6)"; this spec names that key `Brand.filePrefix`.
  - Spec 09 derives the prefix from `brand.files.json` (`brandFilePrefix(brand)`). U9 asserts `Brand.files.json === Brand.filePrefix + '.json'`, so that helper returns `filePrefix` at every commit: `led-wall-config` before T6b, `morph-led-wall` from T6b on. Spec 09 may read `brand.filePrefix ?? …` from T6b on, with no change in output.

### 5.5 `js/theme/ThemeBridge.js` (new, pure: no DOM, no THREE, no imports)

```js
/**
 * @module theme/ThemeBridge
 * Builds a Theme-shaped, deep-frozen object whose colour and font leaves come from CSS custom properties
 * (read through an injected reader). Every other leaf is copied from the base theme.
 * Layer: theme (imports nothing). Pure: Node-testable with a fake reader.
 */

/** [path, cssVar, kind]
 *  kind: 'num'   -> 0xrrggbb            (accepts #rrggbb)
 *        'hex'   -> '#rrggbb' lowercase (accepts #rrggbb)
 *        'rgb01' -> [r/255, g/255, b/255]
 *        'css'   -> '#rrggbb' lowercase, or canonical 'rgba(r, g, b, a)' (accepts either; ints 0-255, a in [0, 1],
 *                   printed with String(Number(a))). Used by spec 04's Theme.uv.
 *  Every path must exist in Theme with a leaf of the matching type (U2). Sibling specs add their rows (5.12). */
export const COLOR_BINDINGS = Object.freeze([
  ['scene.background',              '--scene-background',     'num'],
  ['scene.grid.centerColor',        '--scene-grid-center',    'num'],
  ['scene.grid.color',              '--scene-grid-line',      'num'],
  ['scene.frame',                   '--scene-frame',          'num'],
  ['scene.frameOnLight',            '--scene-frame-on-light', 'num'],   // T5 (with the key)
  ['scene.cameraBody.color',        '--scene-camera-body',    'num'],
  ['scene.cameraBody.outlineColor', '--scene-overlay-halo',   'num'],   // T5 (with the key)
  ['scene.frustumLines.color',      '--scene-frustum',        'num'],
  ['scene.frustumLines.haloColor',  '--scene-overlay-halo',   'num'],   // T5 (with the key)
  ['scene.frustumFill.color',       '--scene-frustum',        'num'],
  ['scene.safeZone.wallColor',      '--scene-safe-wall',      'rgb01'],
  ['scene.safeZone.thresholdColor', '--scene-safe-threshold', 'rgb01'],
  ['scene.safeZone.lineColor',      '--scene-safe-line',      'num'],
  ['scene.safeZone.labelColor',     '--scene-safe-label',     'hex'],
  ['canvas.background',             '--canvas-background',    'hex'],
  ['ui.status.within',              '--status-within',        'hex'],
  ['ui.status.offCenter',           '--status-off-center',    'hex'],
  ['ui.status.exceeds',             '--status-exceeds',       'hex'],
]);

/** [path, cssVar, make] — make(fontFamilyList) returns the leaf (a (px) => string function, or a string). */
export const FONT_BINDINGS = Object.freeze([
  ['canvas.panelLabelFont',       '--font-mono', (f) => (px) => `bold ${px}px ${f}`],
  ['canvas.panelSectionNameFont', '--font-mono', (f) => (px) => `${px}px ${f}`],
  ['canvas.sectionLabelFont',     '--font-ui',   (f) => (px) => `bold ${px}px ${f}`],
  ['scene.safeZone.labelFont',    '--font-ui',   (f) => `600 32px ${f}`],
  // spec 04 adds ['uv.font', '--font-mono', (f) => `11px ${f}`]
]);

/** Theme colour leaves that are deliberately not branded (functional conventions). Read by U10 and U11.
 *  (Spec 01's face-orientation colours are NOT here: spec 01 CR-8 binds them to --scene-face-front/back, 5.12.) */
export const UNBRANDED = Object.freeze([
  'scene.lights.ambient.color', 'scene.lights.point.color',
  'scene.person.body', 'scene.person.dark',
  'scene.car.body.color', 'scene.car.dark.color', 'scene.car.glass.color', 'scene.car.lights',
  'scene.gizmo.x', 'scene.gizmo.y', 'scene.gizmo.z',
  'canvas.panelBorderColors',
]);

/** Default of buildTheme's bindFonts option. false from T2 to T4a; the T5 commit flips it to true.
 *  App and U4 both omit the option, so they always bind fonts identically (8.1 U4). */
export const BIND_FONTS_DEFAULT = false;

/** @returns {{hex: string, num: number, rgb01: number[]} | null}  Accepts exactly /^#[0-9a-fA-F]{6}$/ after trim. */
export function parseHexColor(raw)

/** @returns {string | null}  '#rrggbb' lowercase or canonical 'rgba(r, g, b, a)'; null for anything else. */
export function parseCssColor(raw)

/**
 * @param {typeof import('./Theme.js').Theme} base   the frozen Theme (fallback values and every non-bridged leaf)
 * @param {(cssVarName: string) => string} readVar  returns the computed value ('' when undefined)
 * @param {{warn?: (msg: string) => void, bindFonts?: boolean}} [options]  bindFonts defaults to BIND_FONTS_DEFAULT
 *        (false until T5: canvas fonts keep the base Theme strings, so the T4a change of --font-ui affects only the DOM)
 * @returns a deep-frozen object with exactly base's key structure and leaf types. Never throws for bad tokens.
 *   Objects and arrays are fresh copies and are frozen; function leaves are shared with base by reference and are
 *   never frozen (deepFreeze skips functions), so base is never mutated.
 * Side effects: calls warn at most once per CSS variable name (a variable bound to several leaves warns once),
 *   with the message `ThemeBridge: ${name} is missing or invalid (${JSON.stringify(raw)}); using the Theme.js fallback`.
 */
export function buildTheme(base, readVar, { warn = () => {}, bindFonts = BIND_FONTS_DEFAULT } = {})
```

**App wiring (the one line; replaces `theme = Theme` in ARCHITECTURE section 7):**

```js
theme = buildTheme(Theme, (name) => win.getComputedStyle(doc.documentElement).getPropertyValue(name),
                   { warn: (m) => win.console.warn(m) });          // bindFonts: BIND_FONTS_DEFAULT (flipped in T5)
```

- `App` is the only module allowed to touch `win`/`doc` here (R9 call-time lookup).
- Every existing consumer keeps its constructor signature: `SceneManager`, `LEDWallView`, `CameraRigView`, `SafeDistanceView`, `LEDPixelTextureFactory`, `PanelIdRenderer` and `CameraPanel` read the same paths they read in Phase 1. From T5, `CameraRigView` also reads the three new `frustumLines` keys and `cameraBody.outlineColor`, and `LEDWallView` also reads `frameOnLight` (6.7).
- The computed value of a custom property has its `var()` references substituted. The prototype verified that `--scene-background: var(--morph-black-950)` yields `#0A0A0A` and renders `0x0a0a0a` (pixel-checked). Custom properties are not computed to colours (no `@property` registration), so an `rgba()` token arrives as the authored text with `var()` substituted; `parseCssColor` normalises it.

### 5.6 Bootstrap amendments (ARCHITECTURE section 7)

- `theme = buildTheme(…)` (5.5) instead of `theme = Theme`.
- `project = Project.createDefault({ defaultSectionColor: theme.palette.defaultSectionColor })`.
- `sectionList = new SectionListPanel({ doc, project, wallController, bus, palette: theme.palette })`.
- T10: `brandMark = new BrandMark({ doc, monogramUrl: brand.assets.monogramDark, faviconUrl: brand.assets.favicon })`, passed to `PanelIdRenderer` (`brandMark`) and to `ProjectIO` (to `await brandMark.load()` lazily before the first marked export); `exportPanel = new ExportPanel({ doc, project, projectIO, wallController, bus })`. The two asset files exist only after T4b, which is why T10 depends on T4b (Q2).
- After `orbit.setView('reset')`, the **font gate** (T5):

  ```js
  runFontGate({ fonts: doc.fonts, preloadFonts: theme.canvas.preloadFonts, panelIds, wallController });   // fire-and-forget
  ```

  `js/app/fontGate.js` (new, app layer, Node-testable with fakes):

  ```js
  /** 1. Awaits fonts.load(f) for every preload font f (each failure swallowed; the default text loads the latin subset).
   *  2. pending = panelIds.takePendingFonts(): the [font, text] pairs PanelIdRenderer drew while
   *     fonts.check(font, text) was false (deduplicated; the call clears the list).
   *  3. If pending is empty: return false. Otherwise await Promise.allSettled(pending.map(([f, t]) => fonts.load(f, t)))
   *     (passing the text, so a latin-ext or other subset needed by a section name is loaded too), then call
   *     wallController.rebuildIfPanelIds() exactly once and return true.
   *  @returns {Promise<boolean>} true iff it called rebuildIfPanelIds. Never rejects. */
  export async function runFontGate({ fonts, preloadFonts, panelIds, wallController })
  ```

  - **`PanelIdRenderer` (T5)** gains `takePendingFonts()`. At each `fillText` it checks `doc.fonts?.check?.(font, text) ?? true` with the **actual text** it is about to draw (panel label, section name). When the check is false, it records `[font, text]`. Checking with the real text covers every unicode-range subset, not only the latin subset that the default check text covers.
  - **Registration.** This is a new rebuild call site:
    - ARCHITECTURE 6.2 gains row **`F6-1`** (named row ids, 07 0.4; revision 3 called it row 25, which collided with spec 03): "web fonts settled | `App.start` (`runFontGate`) | `rebuildIfPanelIds` | iff a panel-ID canvas was drawn with a pending (font, text) **and** panel IDs are on | none".
    - The sentence "No other path calls `rebuild()`" is amended to name it (5.11).
  - **Tests, split by owner.**
    - `tests/unit/font-gate.test.mjs` drives `runFontGate` with a fake `fonts`, a fake `panelIds` and a spy `wallController`. It asserts 0 `rebuildIfPanelIds` calls when nothing is pending, and exactly 1 when something is pending. It also asserts that every pending pair is loaded with its own text, that the pending list is cleared, and that a rejecting `load` still ends in one call.
    - The "only if panel IDs are on" condition belongs to `WallController.rebuildIfPanelIds`, so it is asserted where that method is already tested. `tests/unit/wall-controller.test.mjs` gets a row-`F6-1` case on the real `WallController`: one rebuild with panel IDs on, none with them off.
  - **Deterministic.** It never rebuilds at startup, because panel IDs are off by default and nothing is drawn before the fonts arrive. In the harness, the fonts are preloaded before any scenario step and every drawn text is ASCII. So nothing is ever pending, the gate never rebuilds, and no golden output depends on its timing. A user who enabled panel IDs within the font-loading window gets exactly one corrective rebuild.
  - **Documented limitations.**
    - Text drawn **after** the gate has settled (for example a section renamed later to a name in a subset not yet cached) is drawn with the fallback. The first time `PanelIdRenderer` records a pair, it also calls `doc.fonts?.load?.(font, text)` (fire-and-forget, rejection swallowed), so the subset is fetched. The next rebuild, which any edit triggers, then draws the text correctly. There is no second corrective rebuild.
    - The safe-distance label sprite (Montserrat 600) is not redrawn by the gate. It is redrawn on the next camera change (every `CameraHub.refresh()`), and enabling the safe distance takes at least two clicks after load, so in practice the font is present.

    ARCHITECTURE 8.4's font row is reduced to these two sentences.

### 5.7 Consumers changed

| Module | Change |
|---|---|
| `js/ui/SectionListPanel.js` | T1: offset hint `class="curve-hint curve-hint--small"`. T7: constructor gains `palette`; the card template renders swatches from `palette.cardSwatches`: `${palette.cardSwatches.map((c) => `<div class="color-swatch-small ${section.color === c ? 'active' : ''}" data-color="${c}" style="background: ${c};"></div>`).join('')}`. The inline background is per-swatch data. Constants only, so B-M4 does not apply. T4c: label "Panel Colour", title "Custom colour". |
| `js/ui/SectionLogosPanel.js` | Template inline styles → `.logo-row*` classes (T1). |
| `js/ui/CameraPanel.js` | No code change (it already writes `statusEl.style.color = theme.ui.status[…]`; values come bridged). |
| `js/render/CameraRigView.js` | T5, frustum lines: they become two `LineSegments` sharing one geometry.<br>- The halo is a `LineBasicMaterial({ color: haloColor })` at `renderOrder 0`.<br>- The core is a `LineDashedMaterial({ color, dashSize, gapSize })` at `renderOrder 1`.<br>- `transparent` is `opacity < 1` (false for the T5 values). The default `LessEqualDepth` lets the core draw over the halo at equal depth.<br>- `computeLineDistances()` runs on the core after every `rebuildFrustum`. r128 `LineSegments.computeLineDistances` gives every segment its own increasing distance range (it continues the running distance from the end of the previous segment, as built and checked in the r128 browser: `[0, 1, 1, 2, 2, 3.41]` for three segments), so there is no closing-edge artefact (6.6).<br>T5, camera body: its opacity comes from `theme.scene.cameraBody.opacity`. `create()` adds a child `LineSegments(new THREE.EdgesGeometry(bodyGeom), LineBasicMaterial({ color: cameraBody.outlineColor }))` to `bodyMesh`. It moves with the body and `disposeObject3D(group)` disposes it. It is not pickable, because `pickMeshes()` still returns `[bodyMesh]` only.<br>All new materials and geometries go through the existing ResourceTracker. |
| `js/render/LEDWallView.js` | T5: `#buildFrames(layout)` gives each panel's `LineBasicMaterial` the colour `frameColorFor(sl.section.color, display, theme.scene)` (6.7) instead of `theme.scene.frame`. The geometry, the per-panel materials and the dispose path are unchanged. Frames are rebuilt on every wall rebuild, and every change of colour, content mode or wireframe already rebuilds (ARCHITECTURE 6.2), so the frame colour never goes stale. |
| `js/render/frameColor.js` (new, T5) | Pure (no THREE, no DOM; Node-testable): `relativeLuminance(hex)`, `contrastRatio(hexA, hexB)` and `frameColorFor(sectionColor, display, sceneTheme)` (6.7). |
| `js/io/ProjectSerializer.js` | T7: v1 missing-colour fill from `palette.legacySectionColors`. Spec 07 replaces this class; its C11 and `migrateV1toV2` (4.6) already carry the rule over (T8 verifies). |
| `js/io/ObjExporter.js`, `js/io/GltfExporter.js`, `js/app/ProjectIO.js` | No code change for strings: they already read `brand.*` (values change in `Theme.js`, T6a/T6b). |
| `js/render/textures/PanelIdRenderer.js` | T5: fonts come from `theme.canvas` (already); `takePendingFonts()` (5.6).<br>T10, **logo-rect API**:<br>- The body of `sectionCanvas` moves into a private `#drawSection(section, sectionIndex, overrideScale, startCol)`, which returns `{ canvas, logoRect }`. `logoRect` is `{ x, y, w, h }` in that section canvas's pixels, the exact `logoX, logoY, logoW, logoH` that the private `#drawLogo` passed to `drawImage` (legacy 2122-2181). It is `null` when no logo was drawn. `#drawLogo` returns that rect.<br>- The public `sectionCanvas(…)` returns `#drawSection(…).canvas`, so its signature and output are unchanged (the ZIP path and spec 04's viewer are unaffected).<br>- `atlasCanvas(sections, atlas = computeAtlas(sections), { forExport = false } = {})` calls `#drawSection(section, i, s, entry.startCol)` with `s = atlas.pxPerLed`. It maps each non-null `logoRect` into atlas pixels: `{ x: entry.ledOffsetX * s + r.x, y: (atlas.totalLedY - section.panelRows * section.ledY) * s + r.y, w: r.w, h: r.h }`, the same offsets it uses to draw that section's canvas. It collects these into `logoRects`.<br>- `atlasCanvas` draws the mark last iff `forExport && style.brandMarkOnExport && brandMark?.ready`, with the collision rule of 6.5.<br>- The viewport (`LEDMaterialFactory.combined`) never passes `forExport`. |
| `js/app/ProjectIO.js` | T10: `exportPanelIds()` calls `atlasCanvas(sections, undefined, { forExport: true })`, after `await brandMark.load()` when `style.brandMarkOnExport` is on. It stays `async`. The ZIP path (`sectionCanvas`) is untouched. |
| `js/app/WallController.js` | T10: new use case `setBrandMarkOnExport(on)`: `panelIdStyle.set('brandMarkOnExport', on)`, then (from spec 07 H1) `history.record(on ? 'Morph mark on PNG on' : 'Morph mark on PNG off', { coalesceKey: 'panelIdStyle:brandMarkOnExport' })`. It does **not rebuild**: the mark never appears on viewport textures, so it is not a 6.2 call site. It returns the stored boolean. **History record row** for spec 07 5.6.1: `WallController.setBrandMarkOnExport` / `Morph mark on PNG on/off` / `panelIdStyle:brandMarkOnExport`. Before H1, the call goes to spec 07 I3's no-op recorder. |
| `js/ui/ExportPanel.js` | T10: owns `#toggle-brand-mark`. New deps `project`, `wallController` and `bus`.<br>- Click: `wallController.setBrandMarkOnExport(flipToggle(el))`.<br>- After spec 07 X1: `bindSwitchKeys(el)` in `bind()`.<br>- Mirror: `syncFromModel()` calls `setToggle(el, project.panelIdStyle.brandMarkOnExport)`. `ExportPanel` subscribes to `PROJECT_REPLACED`, which spec 07 `ProjectSession.apply` emits for Open, New, Restore, undo and redo. Spec 07's 5.10 list of `syncFromModel()` panels gains `ExportPanel`. Before spec 07 D5 there is no load path that can set the field (v1 files do not carry it), so no mirror is needed until then.<br>ARCHITECTURE 4 state map gains the row `brandMarkOnExport → Project.panelIdStyle.brandMarkOnExport → PanelIdStyle.set (via WallController.setBrandMarkOnExport)`. |
| `js/app/fontGate.js` (new, T5) | 5.6. |
| `js/render/textures/BrandMark.js` (new, T10) | See below. |

```js
export class BrandMark {
  /** @param {{doc: Document, monogramUrl: string, faviconUrl: string}} deps  (no loading in the constructor, R4) */
  constructor({ doc, monogramUrl, faviconUrl })
  /** Idempotent (returns the same promise). Creates both images with doc.createElement('img') (R9: no global Image),
   *  attaches load/error listeners before setting src (same-origin relative URLs, so the export canvas is never tainted),
   *  awaits load-or-error, then awaits img.decode() with its rejection swallowed.
   *  ready iff, for both images, naturalWidth > 0 && naturalHeight > 0 (decided from naturalWidth even when decode()
   *  rejected). Catches every error (the B-L35-style guard). Never rejects. */
  async load()
  get ready()
  /** @param {{canvasW, canvasH, corner: 'bottom-right'|'bottom-left', panelW, panelH, borderPx}} args
   *  @returns {{img: HTMLImageElement, x: number, y: number, w: number, h: number} | null}  (6.5) */
  place({ canvasW, canvasH, corner, panelW, panelH, borderPx })
}
```

### 5.8 Brand assets to publish (`assets/brand/`); **needs the owner's explicit OK** (given 2026-10-16, Q2)

Copying these files into a tracked folder publishes them on GitHub Pages and in git history **permanently** (history rewrites do not reach forks or caches). The implementer must not copy them before the owner says yes in writing (Q2). `Morph Brand Assets/` stays git-ignored. Run `git check-ignore "Morph Brand Assets/README.md"` in CI or before release. A root `.gitattributes` (T4b) marks `assets/brand/*.svg` and `*.png` as `-text`, so no line-ending conversion (`core.autocrlf` on Windows) ever touches the published bytes.

| File (copied byte-for-byte, never edited) | Used by | Size | Copied in |
|---|---|---|---|
| `morph-wordmark-dark.svg` | header | 3.8 KB | T4b |
| `morph-monogram-dark.svg` | watermark, header ≤ 520 px, optional PNG mark | 0.7 KB | T4b |
| `morph-favicon.svg` | favicon; optional PNG mark below 32 px | 1.2 KB | T4b |
| `morph-favicon.png` (64) | favicon fallback | 2.2 KB | T4b |
| `morph-favicon@2x.png` (128) | favicon fallback | 4.9 KB | T4b |
| `morph-app-icon-dark@2x.png` (384) | apple-touch-icon, `og:image` | 15.2 KB | T4b |
| `morph-primary-horizontal.svg` | README (light GitHub theme) | 4.5 KB | T9 (with the README that references it, so R-B4 holds at every commit) |
| `morph-dark-event-lockup.svg` | README (dark GitHub theme) | 9.5 KB | T9 |

**Not published:**
- the light monogram, light wordmark and light app icon;
- the secondary lockup;
- the wave motif;
- every PNG not listed;
- the colour-guideline PDF and MD;
- the Brand Story PDF.

New `assets/brand/NOTICE.md` (T4b; wording to be confirmed by the owner, Q17): the Morph name, the M monogram, the MORPH wordmark and the related artwork are trademarks of Morph and are **not** licensed under the repository's Apache-2.0 licence (Apache-2.0 section 6 already withholds trademark rights; the notice makes that explicit). Forks must remove them.

### 5.9 Events, Strategies, LEGACY registry

- **Events:** none added (no runtime theme switching; bus rule 7 forbids speculative events).
- **Strategies:** none added or flipped.
- **LEGACY_SITES:** none added. B-L24's two documentation-only entries (`css/07-viewport.css`, `css/09-viewport-tools.css`) and the 8.2 row: spec 01 F1-2 narrows them to the badge-overlap half, and **T4a**, which fixes that half, deletes them and updates the header comments of the CSS slices that mention B-L24 (07 C52).
- **ARCHITECTURE 6.2:** row `F6-1` (font gate, 5.6).
- **ARCHITECTURE 8.4:** the "meta author / no favicon" row is deleted (T4a/T4b). The "JetBrains Mono 700" row is reduced to the two font-gate limitations (T5, 5.6).

### 5.10 Render layers and helpers

None new. The watermark is DOM. The frustum gains a second `LineSegments` (the halo) inside the existing rig group, on the same layer as the existing lines. The camera-body outline is a child of `bodyMesh` (same group, same layer). Frames keep their group and layer; only their material colour changes (6.7). The optional PNG mark is a 2D canvas draw.

### 5.11 ARCHITECTURE.md / REFACTOR_PLAN.md amendments (made in the implementing commits)

| Section | Amendment |
|---|---|
| 1.2 Delivery | The head is no longer legacy-exact (favicon, metas, title, font URL). R8 ("markup byte-identical") is a Phase-1 rule and ends with T1. |
| 1.3 | Add `assets/` to the file tree; `theme/ThemeBridge.js` is in layer `theme` (imports nothing); `app/fontGate.js` in layer `app`; `render/frameColor.js` in layer `render` (pure). |
| 2.1 | The 12 legacy stylesheets plus `99-utilities.css`, linked last, with the order rule of 5.2 (07 C52: `00-fonts`, `01-11`, `css/features/*`, `12-responsive`, spec 09's `20-29`, `99-utilities`); descriptions per 5.2; `css-slices.mjs` is report-only and scoped to `01-12` per spec 07 S7 (not retired). |
| 2.2 | + `theme/ThemeBridge.js`, + `app/fontGate.js` (T5), + `render/frameColor.js` (T5), + `render/textures/BrandMark.js` (T10). |
| 3.4 | New values and keys (5.4, 5.12), including `Brand.jsonGenerator`, `Brand.filePrefix`, `frameOnLight` and `cameraBody.outlineColor`; describe ThemeBridge, `UNBRANDED`, `BIND_FONTS_DEFAULT`, the D15 overlay rules. |
| 3.5 | `WallSection.createDefault({color})`, `Project.createDefault({defaultSectionColor})`, `PanelIdStyle.brandMarkOnExport`. |
| 3.7 | `CameraRigView` two-tone frustum (halo + dashed core) and the camera-body edge outline; `LEDWallView.#buildFrames` adaptive frame colour (`frameColor.js`); `PanelIdRenderer.takePendingFonts`, the private `#drawSection` returning `{canvas, logoRect}`, `atlasCanvas` options and the logo-collision rule. |
| 3.10 | `ProjectIO.exportPanelIds` (T10); `WallController.setBrandMarkOnExport` (T10); `App` font gate. |
| 3.11 | `SectionListPanel` palette dep; `ExportPanel` gains `project`, `wallController`, `bus`, `#toggle-brand-mark` and `syncFromModel()`. |
| 4 | State map: `frustumHelper` → `CameraRigView` private `#linesHalo` / `#linesCore`; new row `brandMarkOnExport`. |
| 6.2 | Row `F6-1` and the amended "No other path calls `rebuild()`" sentence. |
| 7 | 5.6. |
| 8.2-8.4 | 5.9. |
| 9 row 6 | "Done; see docs/improvements/06-morph-branding.md". |
| 10 | Static gate: `css-slices.mjs --report-only` (spec 07 S7, if not already); add rules R-B1..R-B5 (R-B3a/b). |
| REFACTOR_PLAN 8 | "Running the checks": the css-slices line gains `--report-only` (spec 07 S7, if not already). |

### 5.12 Coordination with the other feature specs

**This section's per-key table is the spec of record for those keys** (07 0.4). Each feature that adds one of them lands with the values and treatments below in the same commit: its token, its `COLOR_BINDINGS` row, its `Theme` fallback, and the two-tone overlay treatment (a Morph Black halo plus a dashed core from closed `Line`/`LineSegments` geometry, never `LineLoop`) at its render-order slot. The values a sibling spec proposed (the "Proposed value" column) are superseded.

**Rules every sibling spec follows (the feature that adds a key does the work in its landing commit):**
1. Every new scene, canvas or UV colour gets a token (`--scene-*`, `--canvas-*` or `--uv-*`), a `COLOR_BINDINGS` row, and a `Theme.js` fallback equal to the token (U4), or an `UNBRANDED` entry with its reason. U10 fails on any Theme colour leaf that is neither.
2. Every bound or non-exempt colour is ≥ 20 ΔE00 from Pivot Gold and ≥ 15 ΔE00 from the legacy identity colours `#00F0FF` and `#FF00AA` (U6). **Debug exemption:** the leaves under `scene.debug.*` and their tokens (`--scene-normals`, `--scene-normals-face`, `--scene-face-front`, `--scene-face-back`) are exempt from the legacy-identity check, but not from the gold check. They are visible only in spec 01's opt-in debug view, never in the default state, the preview or any export. Spec 01 chose them for mutual distinctness: lime is ΔE00 75.9 from the face-front blue, whereas Sky would be 18.9. The magenta face-normal `#FF4FD8` is ΔE00 8.7 from `#FF00AA`, which is acceptable for a debug colour and is not an identity colour.
3. Every **line overlay that can cross a wall section** is two-tone (D15, 6.6) and is listed in U5's overlay rows. Dashed outlines are drawn from explicitly closed `THREE.Line` geometry (first vertex appended at the end) or from `LineSegments`, never from `LineLoop` (6.6).
4. CSS uses only role tokens: focus outlines `var(--color-focus-ring)`, surfaces `--color-surface-*`, borders `--color-border-*`, accent `--color-accent` (no tinted accent fills), warnings `--color-warning`. No legacy token names (R-B3a) and no colour literals outside `02-tokens.css` (R-B1).
5. File names come from `Brand.filePrefix` or `Brand.files` (U9). The ZIP's combined-mode atlas entry is `'textures/' + Brand.files.panelIdsPng`, never a literal (specs 04 and 08; R-B3b).
6. **Render order** comes from spec 01's registry `core/renderOrder.js`, the single source; no literal ≥ 900 outside it (01's static rule). Slots: `HDRI_BACKDROP` −1e6, `RIG_CORE` 1, `INNER_FRUSTUM_OVERLAY` 990 (09), `MEASURE` 992 (09), `HDRI_MARKER` 993 (05), `UV_HOVER_OUTLINE` 994 (04), `NORMAL_LINES_ON_TOP` 995 (01), `PIVOT_MARKER` 996 (03), `HIGHLIGHT_HALO` 997 / `SECTION_HIGHLIGHT` 998 (02), `GIZMO` 999. Each slot lands with its owning spec (07 0.4).
7. **Harness probes** read colours from the harness palette hook (the live palette and `SceneTheme`, or the swatch values of `sectionsSnapshot`), never from literals (07 C53).

**Per-key contract.** Values are the ones Feature 6 assigns; the spec named in the first column owns the key and its rendering.

| Spec | Key (as proposed by that spec) | Proposed value | Token | Kind | F6 value | Note |
|---|---|---|---|---|---|---|
| 01 | `scene.wallBack` | 0x403c37 (spec 01 r3; its earlier `#16161E` was 1.10:1 on the background) | `--scene-wall-back` | num | `#403C37` (spec 01 CR-8, 07 0.4) | Warm-graphite cabinet back shell, 1.81:1 on Morph Black; ΔE00 58.1 from gold (U6 passes). **The same value everywhere:** the `Theme.js` fallback, `--scene-wall-back`, this `COLOR_BINDINGS` row and spec 01's harness palette, which its `content_probes` cabinet probe reads from the palette hook (07 C53). |
| 01 | `scene.debug.faceFront` / `faceBack` | 0x2f6bff / 0xff3344 | `--scene-face-front` / `--scene-face-back` | num | `#2F6BFF` / `#FF3344` (unchanged) | **Bound** (spec 01 CR-8 gives them tokens and `COLOR_BINDINGS` rows), not `UNBRANDED`. Their values are the face-orientation convention and are never re-coloured (D12, U11). ΔE00 69.3 / 45.9 from gold. |
| 01 | `scene.debug.vertexNormal` | 0xb8f03c (lime; spec 01 replaced its original `#ffd23f`, ΔE00 7.0 from gold) | `--scene-normals` | num | `#B8F03C` (unchanged) | ΔE00 27.3 from gold. The tip is 14.68:1 on black. On the light default wall the tip is 1.05:1, but the base (tip × `lineBaseFactor` 0.35 = `#405415`) is 5.95:1, and spec 01 draws the lines on top. **Sky is rejected:** it is ΔE00 18.9 from the face-front blue (spec 01 4.6). |
| 01 | `scene.debug.faceNormal` | 0xff4fd8 | `--scene-normals-face` | num | `#FF4FD8` (unchanged) | 6.94:1 on black; base `#591C4C` 8.76:1 on the default wall; ΔE00 67.5 from gold. ΔE00 8.7 from the legacy magenta: under the debug exemption of rule 2. |
| 01 | `scene.debug.lineBaseFactor` | 0.35 | – | – | – | non-colour |
| 02 | `scene.selection.primary` | 0xffd400 (ΔE00 8.1) | `--scene-selection` | num | `#F7F7F5` | two-tone core |
| 02 | `scene.selection.secondary` | 0xffffff | `--scene-selection-secondary` | num | `#A3A3A3` | two-tone core for non-primary members of a multi-selection |
| 02 | `scene.selection.hover` | 0xffffff | `--scene-selection` | num | `#F7F7F5` | two-tone core, short dashes |
| 02 | `scene.selection.halo` (**requested new key**) | – | `--scene-overlay-halo` | num | `#0A0A0A` | |
| 02 | `selection.opacity` / `hoverOpacity` | 0.95 / 0.4 | – | – | **1.0 / 1.0** (requested) | at 0.4 a white hover line over the default wall is invisible; hover is told apart by its dash pattern |
| 02 | `selection.selectedDash` / `selection.hoverDash` (**requested new keys**, flat so that U10 classifies them as non-colour) | – | – | – | `[0.12, 0.06]` / `[0.03, 0.03]` (m, `[dashSize, gapSize]`) | `SectionHighlightView` draws each outline twice from **one explicitly closed `THREE.Line` geometry** (the first vertex appended at the end; never `LineLoop`, 6.6): halo `LineBasicMaterial`, then core `LineDashedMaterial`, both `depthTest: false`, `renderOrder` `RENDER_ORDER.HIGHLIGHT_HALO` / `RENDER_ORDER.SECTION_HIGHLIGHT` (997/998, rule 6), with `computeLineDistances()` on the core after every geometry update. |
| 03 | `scene.pivot.color` | 0xffffff | `--scene-pivot` | num | `#F7F7F5` | two-tone core |
| 03 | `scene.pivot.selectedColor` | 0xffdd00 (ΔE00 10.9) | `--scene-pivot-selected` | num | `#C51622` | two-tone core; 3.31:1 on black, 4.23:1 on the default wall |
| 03 | `scene.pivot.anchorColor` | 0x888888 | `--scene-pivot-anchor` | num | `#A3A3A3` | two-tone core |
| 03 | `scene.pivot.haloColor` (**requested new key**) | – | `--scene-overlay-halo` | num | `#0A0A0A` | lines: halo + dashed core (spec 03 already has `dash: 0.05`); core sphere: a halo sphere scaled 1.35× rendered first; the marker at `RENDER_ORDER.PIVOT_MARKER` (996, rule 6) |
| 03 | CSS `--pivot-warning` | `#ffaa00` (ΔE00 7.2) | – | – | `var(--color-warning)` | |
| 03 | `.pivot-mode-option*` CSS | `--bg-secondary`, `--border-color`, `--accent-cyan`, `rgba(0, 240, 255, 0.1)` fill, `outline … var(--accent-cyan)` | – | – | the `.mesh-mode-option` roles of 3.5 (no tinted fill), `outline: 2px solid var(--color-focus-ring)` | |
| 04 | `uv.wire` | '#00f0ff' | `--uv-wire` | hex | `#f7f7f5` | stroked over a 2 px wider `--scene-overlay-halo` stroke (two-tone) |
| 04 | `uv.wireMinor` | 'rgba(0,240,255,0.35)' | `--uv-wire-minor` | css | `rgba(247, 247, 245, 0.35)` | |
| 04 | `uv.island` | '#ffffff' | `--uv-island` | hex | `#f7f7f5` | halo stroke |
| 04 | `uv.handle` | '#ffaa00' (ΔE00 7.2) | `--uv-handle` | hex | `#f7f7f5` | 1 px `--scene-overlay-halo` outline |
| 04 | `uv.handleActive` | '#ff00aa' (legacy magenta) | `--uv-handle-active` | hex | `#f2555a` | 4.48:1 / 5.36:1 on the two checkers |
| 04 | `uv.crosshair` | '#ff00aa' | `--uv-crosshair` | hex | `#f2555a` | |
| 04 | `uv.outside` | 'rgba(10,10,15,0.6)' | `--uv-outside` | css | `rgba(10, 10, 10, 0.6)` | |
| 04 | `uv.pixelGrid` | 'rgba(255,255,255,0.08)' | `--uv-pixel-grid` | css | `rgba(247, 247, 245, 0.08)` | |
| 04 | `uv.checkerA` / `checkerB` | '#2a2a3a' / '#1a1a24' | `--uv-checker-a` / `--uv-checker-b` | hex | `#262626` / `#161616` | neutral |
| 04 | `uv.font` | "11px 'JetBrains Mono', monospace" | `--font-mono` | font | `11px` + `--font-mono` | `FONT_BINDINGS` row |
| 04 | UV-viewer selection outline | `--scene-selection` | – | – | two-tone 2D stroke: halo 3 px, core 1 px | |
| 04 | 3D UV hover outline (`UvHighlightView`) | – | `--scene-selection` / `--scene-overlay-halo` | num | two-tone, as the 02 hover row | at `RENDER_ORDER.UV_HOVER_OUTLINE` (994, rule 6) |
| 05 | `scene.hdri.marker` | 0x00f0ff (legacy cyan) | `--scene-hdri-marker` | num | `#C51622` | Solid octahedron with a 1 px `--scene-overlay-halo` edge outline (`EdgesGeometry`, as for the camera body; D15), at `RENDER_ORDER.HDRI_MARKER` (993, rule 6). 3.31:1 on black, 4.23:1 on the default wall. The marker shows only with HDRI content, where the wall shows the projected image, so the outline (>= 3.31:1 on every palette colour, and dark against any light image) carries contrast where the red fill does not. |
| 05 | `scene.hdri.markerArrow` | 0xffffff | `--scene-hdri-marker` | num | `#C51622` | The arrow is the projection direction (red = direction). Its cone gets the same edge outline. Its shaft is a line overlay that can cross the wall, so it follows the two-tone rule: halo + red dashed core (6.6). Alternatively, spec 05 draws the arrow as a solid cylinder and cone with the edge outline. |
| 05 | `scene.hdri.markerOutline` (**requested new key**) | – | `--scene-overlay-halo` | num | `#0A0A0A` | |
| 05 | `scene.hdri.markerSize` | 0.06 | – | – | – | non-colour |
| 05 | car glTF materials | model data | – | – | – | not theme data; the procedural car stays `UNBRANDED` |
| 05 | `Brand.files.hdriPixelMap` | `hdri-pixel-map.png` until F6 | – | – | `morph-led-wall-hdri-pixel-map.png` | present in `Brand.files` from T6b |
| 05 | Panel IDs sidebar section under HDRI content | – | – | – | – | The section stays visible in every content mode (collapsed by default while `content ≠ panelIds`, hint "Also used by Panel ID exports"; spec 05 3.1), because its style also drives Export Panel IDs and this spec's brand-mark PNG option (T10). |
| 07 | sRGB output switch (R6) | – | – | – | – | **Spec 07 U3 owns it** (07 C54; spec 05 stays on Option L on r128 and its shader port is U3b). With `ColorManagement` enabled, three converts hex material colours from sRGB automatically, so ThemeBridge needs **no** linear kind and tokens stay sRGB hex. Only raw vertex colours (the safe-distance floor through `setRGB(…, SRGBColorSpace)`, and 08's "clamped" tint) and canvas textures (`colorSpace`) need explicit U3 handling. U5/U6 keep testing the sRGB values; U3's manifest declares the re-baselined outputs. |
| 07 | `generator` (C10) | `Brand.jsonGenerator`, 2nd key | – | – | `{ name: Brand.jsonGenerator.name, version: appVersion }`, 2nd key; name "Morph LED Configurator" from T6a | 4.2. `Brand.jsonGenerator = { name }` is added by spec 07 D4 or T6a, whichever lands first. |
| 07 | `panel_id_style.brand_mark_on_export` (C1, 4.3 row) | reserved for F6 | – | – | bool, default `false`, last key of `panel_id_style`; absent until T10, which makes F6's one revision bump (number assigned at merge, `ProjectSchema.REVISIONS`, 07 C40) | 4.2; History row in 5.7 (07 5.6.1 carries it, C59) |
| 07 | `migrateV1toV2` colour row (C11, 4.6) | `colors = palette.legacySectionColors ?? palette.sectionColors` | – | – | as spec 07 (already adopted) | no amendment; T8 verifies |
| 07 | X1 switches | `div.toggle[role=switch]`, `bindSwitchKeys` | – | – | `#toggle-brand-mark` joins X1's switch list | 5.3 |
| 07 | `contrast.test.mjs` (X2) | legacy pairs | – | – | the role pairs of 3.12 (U5 lives in this file) | T4a retargets it if X2 has landed; otherwise X2 is satisfied by U5 |
| 07 | `:focus-visible` outline of switches | `var(--accent-cyan)` | – | – | `var(--color-focus-ring)` | |
| 07 / 09 | file names | `brand.files.json`, `<prefix>-camera-…png` (07 R4), `brandFilePrefix(brand)` derived from `files.json` (09) | – | – | `Brand.files.*`; `Brand.filePrefix = 'morph-led-wall'` from T6b, with `files.json === filePrefix + '.json'` (U9) | 5.4 "Users of the prefix" |
| 07 / 09 | `generator` record in other outputs | `Brand.jsonGenerator` (09 stage-pack manifest and spec-sheet generator) | – | – | `{ name: brand.jsonGenerator.name, version: APP_VERSION }` (07 C62) | 4.2 |
| 04 / 08 | ZIP atlas entry | `textures/PanelIDs_Atlas.png` (08 P2-7f) / `textures/panel-ids.png` (04) | – | – | `'textures/' + Brand.files.panelIdsPng`: `textures/panel-ids.png` before T6b, `textures/morph-led-wall-panel-ids.png` from T6b | T6b's `--rename` map covers the ZIP entry path, the MTL `map_Kd`, glTF `images[].uri` and JSON `atlas.texture_file` (8.3) |
| 07 | header and viewport slots | `#history-undo`, `#history-redo`, `#autosave-status` (H2); `#perf-hud` (X4); top-centre banners | – | – | the header grid's middle column (3.2, C50); `#perf-hud` at `left: 20px; top: 280px` below the reserved zone; `#viewport-top-stack` after `#pilot-info` and `.brand-watermark` (3.3, C51) | |
| 09 | stylesheets `20-29` | linked after every other sheet | – | – | after `12-responsive.css` and before this spec's `99-utilities.css`, which is linked last (5.2, 07 C52) | 09 sheets hold new selectors only |

- **Spec 01 (normals view).** `#toggle-normals` uses `.view-btn` and the `.view-btn.active` style. That rule is spec 01 T7's, its one named owner (07 C52, 2.4); T4a maps it to role tokens. Spec 01's five tokens (`--scene-wall-back`, `--scene-face-front`, `--scene-face-back`, `--scene-normals`, `--scene-normals-face`) and their `COLOR_BINDINGS` rows are added by whichever of spec 01 T10/T7 and this spec's T3 lands later, key by key: T3 landed after 01 F1-1/F1-2 and before F1-5, so T3 added the four debug-view tokens and rows and 01 F1-5 (T10) adds `--scene-wall-back` with `scene.wallBack` and its row. They hold spec 01's values in every layer-4 state: the legacy-valued T3 state and the T5 state alike, because F6 changes none of them.
- **Spec 03 Q10** ("make the pivot OBJ header unconditional?"): **no**. Branding does not change the pivot header policy; identity-pivot exports stay free of pivot lines.
- **Specs 02, 04 and 05 panels.** Floating panels use `--color-surface-overlay`, `--color-border-subtle` and `--color-text-*`. No gold anywhere.

---

## 6. Algorithms and math

### 6.1 WCAG contrast (unit test U5)

`lin(c8) = c ≤ 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4` with `c = c8 / 255`.
`L = 0.2126 R + 0.7152 G + 0.0722 B`.
`ratio = (max(L1, L2) + 0.05) / (min(L1, L2) + 0.05)`.

For a translucent foreground (`rgba(r, g, b, a)` over `bg`), composite per channel first: `round(a · fg + (1 − a) · bg)`. This reproduces the brand file's verified ratios: Black/White 19.80, Black/Gold 10.89, White/Red 5.98, Red/Black 3.31.

### 6.2 ThemeBridge resolution

```
buildTheme(base, readVar, {warn, bindFonts = BIND_FONTS_DEFAULT}):
  out = deepClone(base)                                  // fresh objects/arrays; functions copied by reference
  warned = new Set()
  bad(name, raw) = if !warned.has(name): warned.add(name)
                     warn(`ThemeBridge: ${name} is missing or invalid (${JSON.stringify(raw)}); using the Theme.js fallback`)
  for [path, name, kind] of COLOR_BINDINGS:
     raw = String(readVar(name) ?? '').trim()
     v = kind == 'css' ? parseCssColor(raw) : parseHexColor(raw)        // null unless valid
     if v == null: bad(name, raw); continue                              // keeps the fallback leaf
     set(out, path, kind == 'num' ? v.num : kind == 'hex' ? v.hex : kind == 'rgb01' ? v.rgb01 : v)
  if bindFonts:
    for [path, name, make] of FONT_BINDINGS:
      f = String(readVar(name) ?? '').trim()
      if f == '': bad(name, f); continue                                 // keeps the base function/string
      set(out, path, make(f))
  return deepFreeze(out)                                 // freezes objects and arrays; skips functions (never frozen)
parseHexColor('#C51622') = { hex: '#c51622', num: 0xc51622, rgb01: [197/255, 22/255, 34/255] }
parseCssColor(' rgba(247,247,245,.35) ') = 'rgba(247, 247, 245, 0.35)'
```

- `rgb01` uses `parseInt(hh, 16) / 255`, the same expression as the `Theme.js` fallbacks, so `Object.is` holds.
- T3 parity check: legacy `#33ff66` gives exactly `[0.2, 1, 0.4]`, and `#ff3333` gives `[1, 0.2, 0.2]` (0x33/255 = 0.2 and 0x66/255 = 0.4 in IEEE doubles).
- A variable bound to several leaves (`--scene-frustum`, `--scene-overlay-halo`, `--font-mono`, `--font-ui`) warns once.
- `deepFreeze` skips functions. A shared function (a `CanvasTheme` font helper kept from `base`) would otherwise be frozen through `out` and mutate `Theme`'s own unfrozen function object (ARCHITECTURE 3.4 keeps the helpers unfrozen). U2 asserts `Object.isFrozen(Theme.canvas.panelLabelFont)` is unchanged by `buildTheme`.

### 6.3 Palette distinctness metric (unit test U7)

- Convert sRGB → linear → XYZ (D65) → CIELAB, and compute CIEDE2000 (kL = kC = kH = 1).
- Simulate dichromacy with the Machado, Oliveira and Fernandes (2009) severity-1.0 matrices applied in linear RGB, clamp to [0, 1], convert back to sRGB **without rounding to 8 bits**:
  - protan `[[0.152286, 1.052583, −0.204868], [0.114503, 0.786281, 0.099216], [−0.003882, −0.048116, 1.051998]]`;
  - deutan `[[0.367322, 0.860646, −0.227968], [0.280085, 0.672501, 0.047413], [−0.011820, 0.042940, 0.968881]]`;
  - tritan `[[1.255528, −0.076749, −0.178779], [−0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]`.
- Thresholds (the new palette's measured values in brackets):
  - normal: min pairwise ≥ 20 [25.3];
  - deuteranopia: min pairwise ≥ 10 [13.1] (the prototype's Steel `#7f7f7f` measured 6.6 and is rejected by this threshold);
  - every mode: min pairwise ≥ 7.5 [7.8 protan];
  - every mode: min **cyclic adjacent** ≥ 14 [14.3 protan];
  - every mode: min vs `#0a0a0a` ≥ 25 [26.1 protan];
  - every colour: WCAG contrast vs `#0a0a0a` ≥ 3.0 [3.31 Signal Red] (this is what makes the two-tone halo work against every section, 6.6);
  - every colour: ΔE00 vs `#F2B705` ≥ 20 [22.7 Ember];
  - every colour: ΔE00 vs `#00F0FF` and `#FF00AA` ≥ 15 [15.7 Rose vs magenta].
- The legacy palette fails the pairwise thresholds (8.8 normal, 1.9 tritan), which documents why it was replaced; U7 asserts that as well.

### 6.4 Logo geometry

- **Rendered height:** `h = w × (master H / master W)`, with W/H from the SVG's own `width`/`height` attributes (wordmark 507×147, monogram 233×172, favicon 64×64). This is enforced by giving `<img>` those exact attributes plus CSS `width` and `height: auto`.
- **Clear space:** `clear(w) = max(6, base × w / masterW)` with `base` = 24 (marks) or 32 (lockups).
- **Placement constraint:** every neighbour edge (other element, container edge) is ≥ `clear(w)` away from the artwork bounds.
- **Header vertical fit:** `(60 − 1 − h) / 2 ≥ clear(w)` with `h = 147 w / 507` and `clear = 24 w / 507` gives `59 ≥ 0.3846 w`, so `w ≤ 153 px` for the wordmark. 144 px is chosen; the 120 px brand minimum sets the lower bound.

### 6.5 Panel-ID PNG brand mark placement (T10)

Inputs: atlas canvas `W×H` px; `s = atlas.pxPerLed`; `borderPx = style.borderThickness × s / 4`. Sections are bottom-aligned (y offset `(totalLedY − rows × ledY) × s`) and rows are flipped so that row 0 is at the bottom. Therefore:
- the **bottom-right** corner of the atlas is always the last section's panel (column `cols − 1`, row 0): `e = atlas.entries[n − 1]`;
- the **bottom-left** corner is always the first section's panel (column 0, row 0): `e = atlas.entries[0]`.

`place({canvasW: W, canvasH: H, corner, panelW: e.section.ledX × s, panelH: e.section.ledY × s, borderPx})`:

```
m   = min(panelW, panelH)
h   = min(round(m × 0.22), 96);  w = round(h × 233 / 172)          // monogram-dark
if w < 32:                                                         // below the monogram minimum -> favicon (square plate)
    w = h = round(m × 0.22); img = favicon; if w < 16: return null // too small: no mark
inset = ceil(borderPx) + ceil(24 × w / (img == favicon ? 64 : 233)) // border + proportional clear space
x = corner == 'bottom-right' ? W − inset − w : inset;  y = H − inset − h
```

**Logo rects.** `#drawLogo` returns the rect it passed to `drawImage`, in section-canvas pixels. For a section canvas of size `cw × ch`, a logo scale `k`, an image aspect `a = img.width / img.height` and `margin = min(cw, ch) × 0.05` (legacy 2122-2181):
- `maxW = cw × k`, `maxH = ch × k`;
- if `maxW / maxH > a`, then `h = maxH` and `w = h × a`; otherwise `w = maxW` and `h = w / a`;
- `x` is `margin` (`*-left`), `(cw − w) / 2` (`*-center`, `center`) or `cw − w − margin` (`*-right`);
- `y` is `margin` (`top-*`), `(ch − h) / 2` (`center-*`, `center`) or `ch − h − margin` (`bottom-*`).

`#drawSection` passes the rect up as `logoRect`. `atlasCanvas` translates it into atlas pixels with the offsets it uses to draw that section's canvas (5.7):
- `x + entry.ledOffsetX × s`;
- `y + (atlas.totalLedY − section.panelRows × section.ledY) × s`.

**Logo collision.** With `logoRects` collected that way:

```
mark = place({…, corner: 'bottom-right', last section})
if mark && intersects(mark, logoRects): mark = place({…, corner: 'bottom-left', first section})
if mark && intersects(mark, logoRects): mark = null                 // both corners taken: export without the mark
if mark: draw after every section and logo, globalAlpha = 1 (never faded or recoloured)
```

`intersects` tests the mark rect expanded by its clear space against each logo rect. A user logo at `bottom-right` of the last section therefore moves the mark to the bottom-left; the mark never covers user artwork.

**No overlap with the label (auto font size).** The panel label is centred with font size `0.35 m`, so its glyph box ends about `0.5 m − 0.175 m = 0.325 m` above the panel bottom. The mark's top edge is `inset + h` above the panel bottom.

Check for default 32×32 LED panels with border thickness 8 (`m = 32 s`, `borderPx = 2 s`):
- `h = round(7.04 s) ≈ 7 s`;
- `w ≈ 9.5 s`;
- `inset = 2 s + ceil(24 × 9.5 s / 233) ≈ 3 s`;
- the mark's top is at `≈ 10 s`, below the label's lower edge at `0.325 × 32 s = 10.4 s`.

A fixed large `fontSize` can overlap; that is accepted and stated in the toggle's tooltip (3.5).

### 6.6 Two-tone overlay rule (D15, unit test U5)

For an overlay drawn as a core colour `c` over a halo `k = #0A0A0A` (the halo is a solid line under a dashed core, or a wider 2D stroke under a narrower one), the overlay is legible on a surface `X` when the better of the two reaches 3:1:

```
legible(c, k, X) = max(CR(c, X), CR(k, X)) ≥ 3
must hold for X ∈ { --scene-background } ∪ Palette.sectionColors
```

Why it holds for every allowed core: `k` equals the scene background, so `CR(k, X) = CR(X, #0A0A0A) ≥ 3.31` for every palette colour (U7's contrast floor), and `CR(c, #0A0A0A) ≥ 3.31` for both allowed cores (`#F7F7F5` 18.46, `#A3A3A3` 7.85, `#C51622` 3.31). Measured worst cases: 4.37 (light cores, Iris) and 3.31 (grey and red cores). A single colour cannot do this: anything ≥ 3:1 on both `#0A0A0A` and the default `#D9D9D6` needs a relative luminance in [0.109, 0.197] (for example Signal Red), and such mid tones fall to 1.0-1.3:1 on the mid-tone palette colours (Signal Red, Iris, Steel).

Rendering in r128 (lines are always 1 px in WebGL):
- **3D lines.** The halo is drawn with `LineBasicMaterial`, then the core with `LineDashedMaterial` on the same geometry at `renderOrder + 1`. `computeLineDistances()` runs after every geometry update. The line alternates light and dark along its length.
  - **Allowed geometry:** `LineSegments` (independent segments) or an **explicitly closed `THREE.Line`**, whose position attribute repeats the first vertex at the end: `[p0, p1, …, pn−1, p0]`.
  - **`LineLoop` is not allowed for dashed lines.** In r128, `LineLoop` inherits `Line.computeLineDistances`, which writes cumulative distances `0 … D` along the open polyline `p0 … pn−1`. The GL_LINE_LOOP closing segment `pn−1 → p0` then interpolates `lineDistance` from `D` back to `0`, so a `LineDashedMaterial` squeezes the whole perimeter's dash cycle into the closing edge (a dense dash artefact).
  - With the closed `Line`, the closing edge gets its own distances, `D … D + |p0 − pn−1|`. `LineSegments.computeLineDistances` gives every segment its own increasing range (r128 continues the running distance from the previous segment's end), so it has no artefact either. A plain solid `LineLoop` with only a `LineBasicMaterial` stays allowed.
  - **Unit check (U12):** every dashed outline builder returns geometry whose last vertex equals its first, or is a `LineSegments`; no `LineLoop` carries a `LineDashedMaterial`.
- **Points/spheres:** a halo sphere scaled 1.35× drawn before the core sphere.
- **Solid helper meshes** (camera body, HDRI octahedron and arrow cone): a child `LineSegments(new EdgesGeometry(mesh.geometry), LineBasicMaterial({ color: halo }))`. It is legible when `max(CR(fill, X), CR(halo, X)) ≥ 3`, which holds for X ∈ {background} ∪ palette (worst 3.31).
- **2D canvas:** stroke the halo at `lineWidth + 2`, then the core at `lineWidth`.

### 6.7 Adaptive panel frames (T5, unit tests U5 and U13)

```
frameColorFor(sectionColor, display, scene):
  light = scene.frame          (0xd4d4d4)      dark = scene.frameOnLight   (0x0a0a0a)
  if display.panelIdsEnabled or display.ledSimEnabled or display.content == 'hdri' or display.wireframe:
      return light                                  // near-black textures, or see-through panels on the background
  if sectionColor does not match /^#[0-9a-f]{6}$/i:
      return light                                  // free-string colours (until spec 07's setColor rule): legacy-like default
  return CR(sectionColor, light) >= CR(sectionColor, dark) ? light : dark
```

- `CR` is the WCAG ratio of 6.1 on the 8-bit values.
- `display.content == 'hdri'` exists only once spec 05 lands; before that the term is false.
- **Guarantee.** For any colour `X`, `max(CR(X, light), CR(X, dark)) ≥ sqrt((L_light + 0.05) / (L_dark + 0.05))` = **3.65**, because the better of two contrasts is smallest where they are equal. On the palette the minimum is 3.77 (Steel, dark frame). The light frame is 13.36:1 on the `#0A0A0A` texture background.
- **Palette outcome:** dark frames on Studio Grey (14.00), Sky (7.57), Ember (6.96), Jade (6.20), Rose (8.26), Iris (4.22) and Steel (3.77); a light frame on Signal Red (4.03).
- **Why `#D4D4D4` and not `#F7F7F5`.** Any light frame of luminance ≥ 0.427 (about `#AFAFAF`) keeps the guarantee ≥ 3. `#D4D4D4` (the brand's `--morph-neutral-200`) is the quieter choice for a construction overlay that covers every panel edge.

---

## 7. Export impact

| Output | Change | Step |
|---|---|---|
| OBJ | header lines 1 and 3 (`Brand.objHeader`, `Brand.objGeneratorLine`) | T6a |
| OBJ | `mtllib morph-led-wall.mtl`; filename | T6b |
| MTL | header line | T6a |
| MTL | filename | T6b |
| MTL | `Kd` of the default wall `0.8510 0.8510 0.8392` (was `0.0000 0.9412 1.0000`); section-mode `map_Kd` paths unchanged (B-M2 stays) | T7 |
| glTF | `asset.generator: "Morph LED Configurator"` | T6a |
| glTF | filename | T6b |
| glTF | `baseColorFactor` of default and added sections | T7 |
| JSON (file and ZIP) | `generator.name` inside the 2nd key `generator` (spec 07's v2 writer, C10); the value changes in T6a, or is written with the Morph name from the start if D4 lands after T6a. No timestamp in any variant. | T6a / spec 07 |
| JSON | filename | T6b |
| JSON | default and added-section `color` values | T7 |
| JSON | `panel_id_style.brand_mark_on_export: false` (last key of `panel_id_style`) and F6's one revision bump (number assigned at merge, 07 C40), v2 only | T10 |
| ZIP | archive name `morph-led-wall-export.zip`; entry names `morph-led-wall.{json,obj,mtl,gltf}`; the combined-mode atlas entry `'textures/' + Brand.files.panelIdsPng` (`textures/morph-led-wall-panel-ids.png`), with the MTL `map_Kd`, glTF `images[].uri` and JSON `atlas.texture_file` that name it | T6b |
| ZIP | `textures/<sanitised name>_PanelIDs.png` names unchanged (user data), pixels change (canvas background, section-label font, JetBrains Mono 700) | T5 |
| Panel-ID PNG | background `#0a0a0a`; section names in Montserrat; IDs in a real JetBrains Mono Bold | T5 |
| Panel-ID PNG | filename `morph-led-wall-panel-ids.png` | T6b |
| Panel-ID PNG | optional mark (default off) | T10 |
| Safe-distance OBJ | header (`Brand.safeDistanceObjHeader`) T6a and filename T6b; still unreachable until B-M1 is fixed (the harness records the `ReferenceError`) | T6a, T6b |
| Viewport and preview screenshots | DOM chrome and the badge stacking (T4a), watermark (T4b), sidebar copy (T4c), scene colours, adaptive frames and camera-body outline (T5), default wall colour (T7); the grid-button active style is spec 01 F1-2's | T4a-T7 |

The PNG `tEXt` "Software" metadata is not added (`toBlob` cannot write it; a pure chunk injector is possible later; Q13 note).

---

## 8. Testing

### 8.1 Unit tests (`node --test "tests/unit/**/*.test.mjs"`)

New `tests/unit/theme.test.mjs`:

| # | Test | Enabled |
|---|---|---|
| U1 | `parseHexColor`: `'#C51622'`, `' #c51622 '` → `{hex: '#c51622', num: 0xc51622, rgb01}`; `'#abc'`, `'red'`, `'rgb(1,2,3)'`, `''`, `'#C51622 !important'` → `null`. `parseCssColor`: hex as above; `'rgba(247,247,245,.35)'` → `'rgba(247, 247, 245, 0.35)'`; `'rgba(256,0,0,1)'`, `'rgba(0,0,0,2)'`, `'hsl(0 0% 0%)'` → `null`. | T2 |
| U2 | `buildTheme(Theme, fullReader)`: the deep key structure equals `Theme`'s; every leaf has the same `typeof` (functions stay functions; arrays stay arrays of the same length); every object and array of the result is frozen; `Theme` is not mutated: a deep snapshot of `Theme` before and after is equal, and `Object.isFrozen` of each `CanvasTheme` font function is the same before and after (deepFreeze skips functions, 6.2). Every `COLOR_BINDINGS` and `FONT_BINDINGS` path exists in `Theme` with a leaf of the matching type. **Override (AC 8):** a reader that returns `#123456` for `--scene-frame` and the parsed tokens for everything else yields `scene.frame === 0x123456`, with `Theme.scene.frame` untouched; this is the runtime-override benefit of D7. | T2 |
| U3 | Missing / malformed variables: the fallback leaf is kept and `warn` is called **exactly once per variable name**, with the exact message of 3.11/6.2, even for a variable bound to two leaves (`--scene-frustum`). Font tokens missing (called with an explicit `bindFonts: true`): the base functions are kept, one warning per token. With `bindFonts: false`, font tokens are never read and never warn. | T2 |
| U4 | **Token parity.**<br>- Read `css/02-tokens.css` with `fs`, parse the `:root` declarations (`--name: value;`) and resolve `var(--x)` chains (depth ≤ 8; a cycle fails).<br>- Build `buildTheme(Theme, cssReader)` **without a `bindFonts` option**, exactly as `App` does. Both therefore use `BIND_FONTS_DEFAULT` (`false` in T3/T4a, `true` from T5) and can never disagree.<br>- Assert that every bridged leaf `Object.is`-equals `Theme`'s fallback (functions compared by their output for `px = 40`).<br>- Assert that every `COLOR_BINDINGS` variable exists and parses for its kind.<br>- From T5 (`BIND_FONTS_DEFAULT === true`), additionally assert that every `FONT_BINDINGS` variable exists and that the font leaves match. In T3/T4a the font tokens are unbound: `--font-ui`/`--font-mono` are absent in T3 and DOM-only in T4a, and the canvas still uses the legacy `Theme.js` strings. U4 then asserts the font leaves `===` the base functions (no binding happened). | T3 (against the legacy `Theme.js`), every later step |
| U5 | **Contrast** (lives in `tests/unit/contrast.test.mjs`, spec 07's X2 file, retargeted): every row of 3.12 at or above its threshold, the forbidden pair asserted **below** 3 as documentation. Pairs are resolved from the parsed tokens, so a token edit that breaks contrast fails the test.<br>**UI rows over the scene:**<br>- the selection-badge bar against `--color-surface-1` and the `--color-bg-app` ring, and the preview border against the ring;<br>- chip text against the worst overlay composite (over `#FFFFFF`);<br>- the red-on-translucent-chip pair asserted **below** 3 as documentation;<br>- the active swatch's two rings: light vs `#161616`, and `max(light, dark)` vs **each** palette colour.<br>**Scene rows:**<br>- the adaptive frame, `max(CR(frame, X), CR(frameOnLight, X))`, against **each** `Palette.sectionColors` entry and against `--scene-background`, plus the analytic minimum 3.65 for any colour (6.7);<br>- camera body and HDRI marker as `max(fill, outline)` against `--scene-background` and each palette colour;<br>- every two-tone overlay pair (frustum, selection primary/secondary/hover, pivot/selected/anchor, UV wire) against `--scene-background` and **each** palette colour per 6.6;<br>- the rejected designs asserted below 3 as documentation: the single `#F7F7F5` line @ 0.6 over the default wall, and the single `#616161` frame on Signal Red, Steel and Iris. | UI rows T4a; scene rows T7 (final default and palette); sibling overlay rows with their keys |
| U6 | **Gold exclusivity and legacy identity:** every `:root` token in `02-tokens.css` whose resolved value is a colour, **in every layer** (`--morph-*`, `--ui-*`, `--color-*`, `--status-*`, `--scene-*`, `--canvas-*`, `--uv-*`; `#rrggbb` as is; `rgba()` composited over `#0a0a0a` first; non-colour tokens such as shadows and fonts skipped), plus every bound Theme leaf as returned by `buildTheme`, every Theme colour leaf not in `UNBRANDED`, and every `Palette.sectionColors` entry: ΔE00 ≥ 20 from `#F2B705` and ≥ 15 from `#00F0FF` and `#FF00AA`. Exempt by name: `--morph-gold-500`, `--cta-background` (asserted to resolve to `#F2B705`), and `Palette.legacySectionColors`. **Debug exemption (5.12 rule 2):** leaves under `scene.debug.*` and the tokens `--scene-normals`, `--scene-normals-face`, `--scene-face-front` and `--scene-face-back` skip the legacy-identity check only; they must still be ≥ 20 from gold. | layers 1-3 T4a; layer 4 + Theme leaves T5; palette T7 |
| U7 | Palette distinctness (6.3 thresholds, including deutan pairwise ≥ 10 and contrast vs `#0a0a0a` ≥ 3); palette length 8; all lowercase `#rrggbb`; `cardSwatches === sectionColors`; the legacy palette fails the pairwise thresholds. | T7 |
| U8 | `WallSection.createDefault().color === Theme.palette.defaultSectionColor`; `Project.createDefault({defaultSectionColor: '#123456'}).wall.sections[0].color === '#123456'`. | T7 |
| U9 | Brand strings are ASCII (`/^[\x20-\x7e\n]*$/`); `filePrefix` matches `/^[a-z0-9-]+$/`; every `Brand.files` value equals `filePrefix` + a suffix matching `/^(-[a-z0-9-]+)?\.[a-z]+$/`; the keys `json, obj, mtl, gltf, zip, panelIdsPng, safeDistanceObj, hdriPixelMap` exist (specs 05, 07, 08, 09); `Brand.files.json === Brand.filePrefix + '.json'` (so spec 09's `brandFilePrefix` returns `filePrefix`); the `mtl` filename appears in the OBJ `mtllib` line produced by `ObjExporter`. `Brand.jsonGenerator` is frozen, its keys are exactly `['name']`, and `Brand.jsonGenerator.name === Brand.productName`. | strings and `jsonGenerator` T6a; `filePrefix` and files T6b |
| U10 | **Theme walk:** every leaf under `Theme.scene`, `Theme.canvas`, `Theme.ui` and `Theme.uv` (and any future top-level key except `palette` and `brand`) is classified as exactly one of: bound (`COLOR_BINDINGS`/`FONT_BINDINGS` path), `UNBRANDED`, a function or font string, or non-colour. **Non-colour** means that the last **non-index** path segment (for an array leaf, the key that holds the array) matches, case-insensitively, `/(opacity\|size\|radius\|factor\|alpha\|px\|divisions\|position\|intensity\|dash\|gap\|font\|fonts\|order)$/i`. So `selection.selectedDash`, `frustumLines.dashSize` and `grid.position[0]` are non-colour, while `selection.primary` is not. A nested object such as `{ selected: […] }` is not classified through its parent, which is why 5.12 requests flat `selectedDash`/`hoverDash` keys. An unclassified leaf fails with "add a COLOR_BINDINGS row or an UNBRANDED entry". | T3 |
| U11 | **Conventions unchanged (AC 10):** every `UNBRANDED` leaf `Object.is`-equals its Phase-1 value in `tests/unit/fixtures/legacy-theme.mjs` (a frozen copy of the Phase-1 leaves listed in `UNBRANDED`). The spec 01 face-orientation leaves equal spec 01's values (`0x2f6bff`, `0xff3344`) when present. | T3 |
| U12 | **Closed dashed outlines (6.6):** each dashed outline builder (frustum core, `SectionHighlightView`, pivot glyph, HDRI arrow shaft, as each lands) returns either a `LineSegments`, or a `Line` whose position attribute's last vertex equals its first. A scene walk over the built helpers finds no `LineLoop` with a `LineDashedMaterial`. After `computeLineDistances()`, the closing segment's `lineDistance` values increase (the last value > the second-last value). | T5 (frustum); with each sibling key |
| U13 | **`frameColorFor` (6.7):**<br>- the dark frame for Studio Grey, Sky, Ember, Jade, Rose, Iris and Steel, and the light frame for Signal Red;<br>- the light frame for panel IDs, LED sim, wireframe and a non-hex colour string;<br>- a 4,096-colour sweep (16 levels per channel) never goes below 3.65:1;<br>- `relativeLuminance` reproduces 6.1's reference ratios. | T5 |

Other new and changed tests:
- **`tests/unit/io.test.mjs`.**
  - The oracle comparisons construct exporters with the frozen `LEGACY_BRAND` fixture (`tests/unit/fixtures/legacy-brand.mjs`, the Phase-1 `Brand` verbatim, T6a), so oracle byte-equality keeps testing the writers.
  - The golden-file comparisons use `Theme.brand` against the re-baselined goldens (`GOLDEN_DIR`).
  - **T6b edit:** every hard-coded golden path is derived from `Theme.brand.files` with a helper `golden(step, kind, key)`, which returns `step + '__export-' + kind + '__' + files[key]`. The ZIP entries directory becomes `'final__export-zip__' + files.zip + '.entries/'` followed by `files.json`, `files.obj` and so on. Today these paths are hard-coded (`initial__export-json__led-wall-config.json`, `final__export-zip__led-wall-export.zip.entries/led-wall-config.*`, the `roundtrip__`/`zipjson_roundtrip__` names). Without this edit, the unit gate turns red when T6b re-baselines `GOLDEN_DIR` under the new names.
  - The `ProjectIO` log assertions (`saveText`/`saveBlob`/`zip.file` names) read the injected brand's `files`, not literals.
- **`ProjectSerializer` tests (T7):** v1 missing colours come from `legacySectionColors`. After spec 07 D3, T8 adds the same assertion against `migrateV1toV2`, which spec 07's `project-migrations.test.mjs` already covers (C11).
- **Spec 07 round-trip test (T10).**
  - A project with `brandMarkOnExport: true` survives `write` → `validateProject` → `write` in the `file`, `zip`, `history` and `autosave` variants, and is written as `panel_id_style.brand_mark_on_export: true`, the last key of `panel_id_style`.
  - A file without the key reads as `false` with no issue; `"yes"` reads as `false` with a warning.
  - The written `version` equals `'2.' + KNOWN_REVISION`, and `ProjectSchema.REVISIONS[KNOWN_REVISION]` lists `panel_id_style.brand_mark_on_export` (its number is assigned at merge, 07 C40).
  - `generator` is the 2nd key and equals `{ name: Brand.jsonGenerator.name, version: APP_VERSION }`. No key named `savedAt`/`saved_at` appears in the project object of any variant (the autosave envelope's own `saved_at`, spec 07 4.8, wraps it and is not part of it).
  - A case is added to spec 07's reachability property test.
- **`tests/unit/domain.test.mjs`:** `createDefault` signature; `PanelIdStyle.set('brandMarkOnExport', 'true')` stores `false`.
- **Font gate (5.6).** New `tests/unit/font-gate.test.mjs` covers `runFontGate` with fakes: spy calls, the text passed to `load`, the pending list cleared, and rejection tolerance. `tests/unit/wall-controller.test.mjs` gets a row-`F6-1` case on the real `rebuildIfPanelIds` (panel IDs on: one rebuild; off: none).
- **`tests/unit/wall-controller.test.mjs` (T10):** `setBrandMarkOnExport(true)` stores `true`, calls no rebuild, and records once with label `Morph mark on PNG on` and coalesce key `panelIdStyle:brandMarkOnExport` (from H1).
- **T10, `PanelIdRenderer` logo rects (6.5):** with a fake 2D context that records `drawImage` arguments:
  - for each of the 9 logo positions (`top-left` … `bottom-right`), `#drawSection` (through a test-only export or the `atlasCanvas` path) returns a `logoRect` equal to the recorded `drawImage` rect, and no logo returns `null`;
  - in a three-section atlas with different heights, each translated rect equals the section rect plus `(ledOffsetX × s, (totalLedY − panelRows × ledY) × s)`.
- **T10, `BrandMark.place` table tests (6.5):** the default panel returns a monogram; small panels return the favicon; tiny panels return `null`; the mark never exceeds its corner panel; `bottom-left` mirrors `bottom-right`.
- **T10, collision tests:** `atlasCanvas` with a fake 2D context. A logo at `bottom-right` of the last section moves the mark to the bottom-left; logos in both corners give no mark.
- **T10, `BrandMark.load`:** a fake `doc` whose `decode()` rejects but whose `naturalWidth > 0` ends `ready`.

### 8.2 Static checks (`tests/static/check.mjs`, new rules)

| Rule | Check | Enabled at |
|---|---|---|
| R-B1 | `css/*.css` (including `css/features/*.css`) other than `02-tokens.css` contain no colour literals **in declaration values**: the text between `:` and `;` inside a `{…}` block, after stripping comments. Forbidden: `#[0-9a-f]{3,8}\b`, `rgb(`, `rgba(`, `hsl(`, case-insensitive. Selectors such as `#add-section-btn` are not scanned. | end of T4a |
| R-B2 | `index.html` inline `style` attributes contain only `display`, `width`, `height` declarations; no `var(--` and no colour literal. | end of T1 |
| R-B3a | Legacy identity residue in `index.html`, `css/`, `js/` (tests/fixtures excluded): no legacy token name (`--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--accent-<any>`, `--text-primary`, `--text-secondary`, `--text-dim`, `--border-color`, `--glow-cyan`, matched as whole custom-property names, so `--color-text-primary` does not match), no `Fivefold`/`fivefold`, no `company-logo`, no `rgba(0, 240, 255`. | end of T4a |
| R-B3b | Legacy product and file names in the same scope: no `'Outfit'`/`Outfit`, `LED Wall Configurator`, `led-wall-config`, `led-wall-export`, and no filename token `panel-ids.png`, `PanelIDs_Atlas.png` or `safe-distance-floor.obj` (whole tokens, so `morph-led-wall-panel-ids.png` does not match). The ZIP atlas entry is built as `'textures/' + Brand.files.panelIdsPng`, never a literal. | after the **last** of T5 and T6b |
| R-B4 | Every `assets/brand/…` reference in `index.html`, `css/`, `js/`, `README.md` resolves to an existing file with exact case; every file in `assets/brand/` except `NOTICE.md` is referenced at least once. (T4b copies only files that T4b references; the README lockups arrive together with their README references in T9.) | T4b |
| R-B5 | Exactly one element in `index.html` has class `export-btn--primary`; `--cta-background` is referenced by exactly one CSS declaration. | T4a |

### 8.3 Harness changes (`tests/regression`, edited in the step named)

| File | Change | Step |
|---|---|---|
| `lib/app.mjs` `FONT_PRELOADS` | add `"bold 32px 'Montserrat'"`, `"600 32px 'Montserrat'"`, `"32px 'Montserrat'"` | T4a |
| `lib/app.mjs` `FONT_PRELOADS` | remove the two Outfit entries | T5 |
| `lib/uiprobe.mjs` `FONT_FACES` | add `['Montserrat', [400, 500, 600, 700]]` (Outfit and JetBrains Mono 300-600 kept) | T4a |
| `lib/uiprobe.mjs` `FONT_FACES` | `['JetBrains Mono', [400, 500, 600, 700]]`; Outfit removed | T5 |
| `lib/uiprobe.mjs` text snapshot | `header.logo: texts('.logo-text')` → `texts('.product-name')` | T4a |
| `lib/uiprobe.mjs` text snapshot | add `header.brandAlt: [...document.querySelectorAll('.brand-lockup img')].map((i) => i.alt)` | T4b |
| `ui-spec.mjs` | replace `page/logo` (`.logo`, `layout: true`) with `page/brand-lockup` (`.brand-lockup`, `layout: true`); replace `logo-icon`, `logo-text`, `logo-text/span` with `product-name`; delete `company-logo`, `company-logo/path`; `CSS_TOKENS` → the role tokens of 5.1 layer 3 | T4a |
| `ui-spec.mjs` | add `page/brand-wordmark`, `page/brand-monogram`, `page/brand-divider`, `overlay/brand-watermark` | T4b |
| `scenarios.mjs` line 198 | `${card(1)} [data-color="#ff6b35"]` → `${card(1)} .color-swatch-small:nth-child(4)` (index-based, palette-independent, still scoped to card 1; against the legacy palette it selects the same `#ff6b35` swatch) | T7 |
| `scenarios-extra.mjs` colour matchers | (Their target colours come from the harness palette hook, the live `SceneTheme`, where the hook exists; 07 C53. The thresholds below are derived from the T5 values it returns.) `isCameraBody = (r, g, b) => r >= 150 && g <= 50 && b <= 60` (was `r >= 170 && 60 <= g <= 105 && b <= 45`, tuned for 0xff6600 @ 0.8 ≈ (206, 84, 3)). The T5 body 0xc51622 @ 1.0 is exactly (197, 22, 34); under one or two layers of the 0.05 frustum fill it is ≤ (201, 44, 55); over the default wall it stays (197, 22, 34). `isGizmoRed` gains `&& g >= 24`: real gizmo-red pixels (0xff4444 @ 0.35) have g ≥ 30 over the darkest background, while anti-aliased edges of the red camera body ((10 + 187c, 10 + 12c, 10 + 24c), e.g. (104, 16, 22) at c = 0.5) have g ≤ 22, so the two matchers stay disjoint (`isGizmoRed` also keeps `r <= 128`). `isGizmoGreen` is unchanged: the T5 safe band green @ 0.5 ≈ (36, 112, 75) fails its `b <= 60`, and the red end ≈ (104, 16, 22) only matters with the safe band on, which `gizmo_drag` never enables. The frustum lines are neutral greys (no matcher accepts r − max(g, b) ≥ 40 for them). The camera-body edge outline (`#0A0A0A`) only darkens the body's silhouette edges, which the centroid pick never uses; its blends with the red fill are the same `(10 + 187c, …)` family as the anti-aliased edges above. The adaptive frames are neutral (`#D4D4D4`/`#0A0A0A`) and never match a colour matcher. The comment block above the matchers is updated with these blends. | T5 |
| `compare.mjs` | `--rename old=new[,old=new…]`: maps output keys, ZIP entry names (including the `textures/` atlas entry path) and exact filename tokens inside the baseline's text outputs (`downloads.json`, OBJ `mtllib`, MTL `map_Kd`, glTF `images[].uri`, JSON `atlas.texture_file`) before comparing, so T6b can be checked for byte identity. `--ignore-keys classes,class`: drops those JSON keys on both sides (T1 cross-check; reused as `--ignore-keys statusColor` in T5). `--diff-bbox`: prints the bounding box of differing pixels per screenshot (T4b review aid; 01 T2 already added it, so T4b only uses it). T4b's rect limit itself is a `rects` field on its `--expect` manifest entries, measured by 01 T2's `measure-rects` (07 C57). | T1 (`--ignore-keys`), 01 T2 (`--diff-bbox`, used by T4b), T6b (`--rename`) |
| `scenarios.mjs` new scenario `brand_mark_png` | panel IDs on, `#toggle-brand-mark` on, export Panel IDs, record the PNG; then a section logo at `bottom-right` of the last section, export again (mark moved to bottom-left) | T10 |
| `README.md` (harness) | product name, filenames, matcher notes, new scenario | T6b/T10 |
| `findPersonPixel` (`scenarios.mjs`) / `isPerson` (`scenarios-extra.mjs`) | **Re-derived in T7** for the new default wall. The person prop (0x4488ff @ 0.85) composites to (59, 117, 218) over the background, (71, 141, 252) over Sky, and **(90, 148, 249) over the Studio Grey wall**. That last value fails today's `r <= 80`: in `toggles/12`, about 10,800 of 12,400 matched pixels would drop out, and the pick would fall back to a ~23 px band below the wall edge (centroid (619, 565)).<br>The two copies get one predicate: `(b >= 200 && r >= 40 && r <= 80 && g >= 95 && g <= 170) \|\| (b >= 240 && r >= 81 && r <= 95 && g >= 135 && g <= 160)`. The second branch accepts the person over the light wall. It rejects Sky itself (88, 166, 232: `b < 240`, `g > 160`), Iris and Steel (`r > 95`), every neutral grey (`b - r < 145`), and the new chrome (no blue).<br>Every person pick (keyboard, ui_visual, gizmo_drag) happens with the camera preview **off**, so no frustum overlaps the person. Even two layers of the 0.05 light fill over the background would give (77, 130, 220), still inside the first branch.<br>T7 verifies the picked pixel with `REGRESSION_DEBUG_DIR` (it must lie on the person's body, not on a band below the wall). `person_pick.json` and `selection_pick.json` must stay IDENTICAL (`{found: true}`). | T7 |
| `locate()` exclusions | unchanged code. `pageOverlayRects` excludes every visible `.viewport-overlay > *`, which includes the T4b watermark (the Fivefold logo it replaces was excluded the same way), so the red wave of the monogram can never be picked as the camera body. | – |

### 8.4 Golden outputs per step (each its own commit and harness run)

| Step | Change | Outputs expected to change (everything else must be IDENTICAL) | Re-baseline |
|---|---|---|---|
| T1 | inline styles → classes; dead CSS removed; `99-utilities.css` | **Only class keys.** (a) `ui_visual/*.styles.json`: the `classes` arrays of these probed elements: `global-section/mesh` (+`mt-16`; the first `.global-section`, "Mesh Options", carries the inline `margin-top: 16px`, not `global-section/display`; corrected in T1), `led-sim-options/input-field` (+`mt-10`), `select#led-layout` (+`ui-select`), `panel-id-options/input-field` (+`mt-10`), `input#panel-font-color` (+`color-input-full`), `panel-id-options/toggle-container` (+`mt-10`), `select#camera-filmback` (+`ui-select`), `custom-filmback/row` (+`section-row--flush`), `camera-info` (+`readout`), `camera-info/row` (+`readout-row`), `camera-info/row-last` (+`readout-row readout-row--last`), `camera-info/key` (+`readout-label`), `camera-info/value` (+`readout-value`), `camera-options/row` (+`mb-8`), `camera-options/row-single` (+`mb-10`), `frustum-status` (+`readout`), `frustum-status/row` (+`readout-row`), `frustum-status/status-text` (+`status-pending`), `frustum-status/safe-distance` (+`status-ok`), `camera-options/toggle-container` (+`mt-12`), `button#reset-camera` (+`btn-block mt-10`), `button#export-safe-distance` (+`btn-block mt-6`), `person-options` (+`mt-10`), `person-options/row` (+`mb-8`), `car-options` (+`mt-10`), `car/toggle-container` (+`mt-12`), `card0/offset-hint` and `card1/offset-hint` (+`curve-hint--small`), `logos/item` (+`logo-row`), `logos/item-name` (+`logo-row__title`), `logos/position/label` (+`logo-row__label`), `logos/scale/input` (+`logo-row__input`), `camera-window` (+`preview-window`), `camera-window/resize` (+`preview-window__resize`), `camera-window/resize-svg` (+`preview-window__icon`), `camera-window/top-bar` (+`preview-window__header`), `camera-window/bottom-bar` (+`preview-window__footer`). Unchanged: `subsection-title` and `camera-options/subsection-title` (they already carry the class; only "Camera Rotation" gains `--tight` and it is not probed), `camera-window/canvas` (keeps its inline size). (b) `ui_visual/*.text.json` (`pageCaptureText` writes the sorted `class` of every `button`, `select` and `label`): `#reset-camera`, `#export-safe-distance`, `#led-layout`, `#camera-filmback`, and, in the states where section-logo rows exist, their "Position" and "Scale (%)" labels (+`logo-row__label`). (c) The three 08 P2-0 logo-list probes that record every `[data-section-id]` element of the logo rows with its `class` attribute (`p2_xss_names/logos_01_panel_ids.json`, `p2_xss_names/logos_02_renamed.json`, `p2_project_v2/logos_03_uploaded.json`): the scale input's `class` `""` → `"logo-row__input"` (added by T1's first gate run, which found them). Every computed-style value, rect, other text and screenshot is IDENTICAL. | If spec 07 E1 has not landed yet, T1 also switches `css-slices.mjs` to `--report-only` (spec 07 S7, 5.2); that changes no harness output. Run `compare.mjs --ignore-keys classes,class`: must be IDENTICAL everywhere. Then the plain compare must list only the `classes`/`class` keys of the elements above. Re-baseline `ui_visual` styles and text and the three logo-list probes of (c) (manifest `F6-T1`). |
| T2 | `theme/ThemeBridge.js` and its unit tests only; nothing imports it yet | **none** (no runtime change) | no |
| T3 | ThemeBridge wired in `App`; layer-4 tokens added holding the legacy values (`--scene-background: #0a0a0f`, `--scene-safe-wall: #33ff66`, `--scene-safe-threshold: #ff3333`, `--status-off-center: #ffaa00`, …); `.status-*` classes point at the `--status-*` tokens; `BIND_FONTS_DEFAULT = false` | **none** (`CSS_TOKENS` lists only legacy names, which are untouched) | no |
| T4a | UI chrome without brand artwork (ungated): token layers 1-3 with brand values, all CSS rewritten to roles (legacy tokens and literals removed, sibling CSS migrated), text-only `<h1>` header, Fivefold logo deleted, title/metas/OG text, Montserrat for CSS (T4a font URL), component states, emoji → SVG, resize-grip `currentColor`, gizmo icon size, contrast test retargeted, harness `ui-spec`/fonts/text-probe edits; opaque selection badge with its outer ring and its `bottom: 64px` stacking above the help badge (B-L24's overlap half, 2.4), `.view-btn.active` mapped to role tokens if spec 01 T7 has landed, the header grid of 3.2 (with H2's history group if H2 has landed), preview-window ring, two-tone active swatch ring; `.section-row { align-items: end }` and 0.06em field-label tracking. **Label-fit check (review step):** in the candidate page at the harness size (1600 × 1000), with two expanded section cards, a label wraps iff its text spans more than one line box. The check is a console snippet: `[...document.querySelectorAll('.input-field label')].filter((l) => { const r = document.createRange(); r.selectNodeContents(l); return r.getClientRects().length > 1; }).map((l) => l.textContent)`. The resulting list goes into the commit message and becomes T4c's shortening list (3.1). The `align-items: end` rule already keeps the inputs aligned while the list is non-empty. | `ui_visual`: every `styles.json` (values, `cssTokens`, the replaced header/overlay entries), every `text.json` (title; `header.logo` = "Morph LED Configurator"; pilot and preview texts without emoji; `#export-zip` class `export-btn export-btn--primary`), every page/sidebar/viewport screenshot. **Every `*.screenshot.png` of every scenario** (the canvas-clipped screenshot includes the DOM overlay: buttons, badges, preview frame, and the removed Fivefold logo). **Not changed:** every export and PNG (canvas fonts and the font URL's JetBrains/Outfit sets are unchanged), every section-state JSON (card text unchanged until T4c), `gizmoState`/`cameraState` JSON (show/hide mechanisms and the `--status-*` legacy values unchanged), `console.json`. | `ui_visual` + all screenshots |
| T4b | **Owner OK required.** 6 assets + `NOTICE.md`; favicon/apple-touch/`og:image`; wordmark lockup; monogram ≤ 520 px; watermark; R-B4 | `ui_visual`: `styles.json` (header entries and the four new probes), `text.json` (`header.logo` = "LED Configurator", `header.brandAlt`), page/viewport screenshots (header). Every `*.screenshot.png` whose state does not show the pilot banner, with the differing pixels **confined to the watermark rectangle** (viewport x 79-125, y 23-58), declared as a `rects` field on those `--expect` manifest entries (07 C57) and reviewed with `--diff-bbox`. The `ui_visual` page captures are limited to the header and the watermark, except `00_initial`, the masked capture of the page as loaded: there Chrome re-rasterises the overlay once an image joins it (the toolbar icons' anti-aliasing, the help badge text by 1 level), so its entry also allows the two toolbar columns and the help badge. The watermark's own compositing layer (`will-change: transform`, 3.3) keeps that effect out of every `#three-canvas` capture and the later page captures (found by the T4b gate). `console.json` IDENTICAL (no 404s). Every `*_pick.json`/`*_handle.json` IDENTICAL. | `ui_visual` + those screenshots |
| T4c | British copy (Q14 = yes): "Panel Colour", "Label Font Colour", "Section Label Colour", `title="Custom colour"`, the logo position options "Top Centre", "Centre Left", "Centre", "Centre Right", "Bottom Centre"; plus the shortened field labels from T4a's label-fit list (as built: "Angle Between Panels (°)" → "Panel Angle (°)") | The card `text` in `sections_initial.json` of the 7 config scenarios (`flat3`, `concave_offsets`, `convex`, `mixed`, `box_corner`, `large_wall`, `default`); the 9 `import_edge` and 16 `ui_sections` section-state JSONs that contain the card text; the four 08 P2-0 section-state probes that record it (`p2_xss_names` `sections_initial`/`sections_renamed`, `p2_zero_inputs/sections_zero`, `p2_zip_section_mode/sections_renamed`); the 17 logo-row probes that record the rows' text (`logos/logos_*` (10), `name_with_panel_ids` `name_00`, `01`, `03`, `04`, `p2_project_v2/logos_03_uploaded`, `p2_xss_names` `logos_01`/`logos_02`); the 7 `ui_visual/*.text.json` (labels, `innerText`, `titleAttributes`, select options); `ui_visual` sidebar and viewport (full-page) screenshots (not the narrow one, which shows only the top of a card). Nothing else: no export changes (JSON keys are unchanged). `styles.json` is expected IDENTICAL except the rects of the labels on the T4a label-fit list, which shrink from two lines to one, and what that moves: the computed height of the cards and rows that hold them, the rect of every element below them in the sidebar (11 px up per expanded card, as built), and `controlPanelScroll`, which every snapshot records, the overlay-only ones (01, 02, 03, 05) included. Any other rect change means a label now wraps; that must be fixed, not re-baselined. | the listed files |
| T5 | Scene/canvas: layer-4 token values + `--scene-overlay-halo` + `--scene-frame-on-light`, two-tone frustum and camera-body outline (`CameraRigView`), adaptive frames (`LEDWallView`, `frameColor.js`), camera body opacity, canvas fonts, status colours, `BIND_FONTS_DEFAULT = true`, final font URL (JetBrains Mono 700 added, Outfit and 300 removed), font gate, harness matchers and font lists | **Changed:**<br>- every `*.screenshot.png` (WebGL pixels: background, grid, frames, camera body, frustum, safe zone);<br>- every exported panel-ID PNG and every ZIP `textures/*.png` entry (canvas background, Montserrat section label, JetBrains Mono 700);<br>- **the `statusColor` key of every `cameraState` record, in all 35 files that carry it**: `camera` (18 files); `gizmo_drag/camera_01_translated.json` and `camera_02_rotated.json`; `pilot_look/look_00_pilot_on.json`, `look_01_after_drag.json`, `look_03_pilot_off.json`; `preview_off_in_pilot/pilot_00_on.json`, `pilot_01_preview_off.json`, `pilot_02_P_alerts_again.json`, `pilot_03_Escape_alerts_again.json`, `pilot_04_preview_on_again.json`, `pilot_05_P_exits.json`; `preview_resize/resize_02_custom_100x10.json`; `import_edge/i_empty_state.json`; and, as built (the 08 P2-0 scenarios carry it too, which revision 3.1 did not count), `p2_project_v2/camera_01_setup.json`, `camera_06_restored.json`, `camera_07_reimported_preview_on.json` and `p2_zero_inputs/camera_zero.json`. Values: `rgb(0, 255, 102)` → `rgb(61, 214, 140)`, `rgb(255, 170, 0)` → `rgb(255, 134, 64)`, `rgb(255, 68, 68)` → `rgb(242, 85, 90)`;<br>- `ui_visual` styles of `#frustum-status-text` and `#safe-distance` in every state that probes them (as built 00, 04, 06, 07, 08), and the `ui_visual` captures that show them: the full-height sidebar captures of 04, 06, 07 and 08;
- (found by the T5 gate) the 8 `ui_visual` page captures, through the final font URL: the W of the world-space gizmo button is JetBrains Mono 700, which the T4a URL did not load (Chrome synthesised it from 600), and a few edge pixels of the header stat values (JetBrains Mono 500) change with the new font file;<br>- the probe JSON outputs that record scene colours (spec 01's `content_probes`, `face_probes` and similar), declared in this step's `--expect` manifest; the probes read their colours from the palette hook (07 C53), so their found/size results stay the same.<br>**Cross-check:** `compare.mjs --ignore-keys statusColor` must report those 35 files IDENTICAL, so every other key, including the `gizmo_drag` translated/rotated poses, is unchanged.<br>**Must stay IDENTICAL:** `gizmo_drag` `camera_pick.json`, `person_pick.json` and every `*_handle.json` (`{found: true}`), and all non-PNG exports. A pose difference in `gizmo_drag` (other than `statusColor`) is acceptable only if the debug dump (`REGRESSION_DEBUG_DIR`) shows the picked handle pixel moved by a few pixels (for example a frustum dash gap next to the arrow tip), never if a handle was not found. | screenshots, PNG, ZIP texture entries, the 35 `statusColor` files, the listed `ui_visual` files, the declared probe JSONs (as built none: they read their colours from the palette hook and are IDENTICAL) |
| T6a | Export header and generator strings only (filenames unchanged; `filePrefix` not yet added) | OBJ lines 1 and 3 (file and ZIP entries), MTL line 1, glTF `asset.generator`, and, iff spec 07 D4 has landed, the JSON `generator.name` inside the 2nd key. Compared in place; the diff shows only those lines. | the listed outputs |
| T6b | Filenames only (`Brand.filePrefix` added; `Brand.files` derived from it); `tests/unit/io.test.mjs` golden paths derived from `Brand.files` (8.1) | Run `compare.mjs --rename led-wall-config.json=morph-led-wall.json,led-wall-config.obj=morph-led-wall.obj,led-wall-config.mtl=morph-led-wall.mtl,led-wall-config.gltf=morph-led-wall.gltf,led-wall-export.zip=morph-led-wall-export.zip,panel-ids.png=morph-led-wall-panel-ids.png,safe-distance-floor.obj=morph-led-wall-safe-distance.obj`: **every output and every ZIP entry must be IDENTICAL under the map** (this includes the OBJ `mtllib` line and `downloads.json`). Without the map the manifest reports missing + extra, which is expected. | all renamed outputs, after the mapped compare is IDENTICAL |
| T7 | Palette defaults and swatches | **Changed:** `sections_initial.json` of the 6 imported configs (`flat3`, `concave_offsets`, `convex`, `mixed`, `box_corner`, `large_wall`): `activeSwatches` only (each becomes `[]`, since no imported colour is in the new palette); `default`: `sections_initial.json` (`activeSwatches` `[#d9d9d6]`, custom-colour input value), every export carrying the colour (JSON `color`, MTL `Kd`, glTF `baseColorFactor`, and the same ZIP entries), screenshots showing the wall; the probe JSON outputs that record the wall colour (spec 01's `content_probes` and similar, read from the palette hook, 07 C53), declared in this step's `--expect` manifest; `toggles` and `keyboard` screenshots showing the wall; the extra scenarios that start from the default wall without importing: `preview_off_in_pilot`, `pilot_look`, `gizmo_drag`, `preview_resize` (screenshots), `logos` (ZIP `json`/`mtl` entries), `name_with_panel_ids` (JSON exports); `import_edge`: section states (`activeSwatches`, colours of the sections added in steps i and v) and the exports/screenshots of states containing an added or default-coloured section; `ui_sections`: swatch DOM, colours of added sections, the swatch click (4th swatch = Ember), its exports; `ui_visual`: styles (`.section-color` background, swatch entries and their `matches` 6 → 8, custom input rect) and screenshots. **Unchanged:** every export and screenshot of the 6 imported configs and of `camera` (colours imported verbatim; `concave_offsets`' colour-less v1 section keeps the legacy fill). The reviewer confirms that the 6 configs' `sections_initial.json` differ only in `activeSwatches`. The new person predicate (8.3) is checked: `person_pick.json` (keyboard, gizmo_drag) and `ui_visual/selection_pick.json` stay IDENTICAL, and the `REGRESSION_DEBUG_DIR` dump shows each pick on the person's body. | affected scenarios |
| T8 | Spec 07 integration check: C11 (`migrateV1toV2` fills v1 colours from `legacySectionColors`, already in spec 07 4.6) and `generator` (2nd key, `{name: Brand.jsonGenerator.name, version: APP_VERSION}`), one unit assertion each | **none** (`concave_offsets` and every v1 import stay IDENTICAL; `generator` is already written by D4 with the T6a name) | no |
| T9 | README / Pages / NOTICE; the 2 README lockups (gated) | none | no |
| T10 | Optional PNG mark | `ui_visual` (the new toggle row in `.export-section`: `matches` of `toggle-container`/`toggle-label`, `export-section` and later rects, `controlPanelScroll`; `text.json` `toggleLabels`, `labels`, `innerText`; sidebar and viewport screenshots); every v2 JSON output (F6's one revision bump, its number assigned at merge (07 C40), and `panel_id_style.brand_mark_on_export: false` as the last key of `panel_id_style`) iff spec 07 D4 has landed; new `brand_mark_png` outputs. Panel-ID PNGs with the toggle off: IDENTICAL. | affected + new scenario |
| (T11) | **Dropped (07 C52).** `.view-btn.active` is spec 01 F1-2's change; the badge stacking is in T4a's list above. | – | – |

**Re-baseline procedure (every step with listed changes):** spec 08 §8.1 is the only procedure (07 C26): each step's list above is its `--expect` manifest (with `rects` fields where a step is rect-limited, 07 C57).
1. Run `node tests/regression/run.mjs --root . --out <cand>` and `compare.mjs <baseline> <cand> --verbose` (plus the step's option: `--ignore-keys classes,class` for T1, `--diff-bbox` for T4b, `--ignore-keys statusColor` as T5's cross-check, `--rename` for T6b).
2. Review the report. Every FAIL/WARN must belong to the step's list above. A failure outside the list is a bug, not a baseline update.
3. Re-capture the baseline from the step's commit **twice**, and confirm the two runs agree (self-consistency).
4. Record the commit hash and the reviewed diff summary in the commit message.

The baseline directory is git-ignored, so the commit message is the audit trail. Re-baselines are serialised: one re-capture at a time, in step order.

### 8.5 Manual checks

- GitHub Pages smoke test: favicon in Chrome, Firefox and Safari tab strips (note which file each fetches: SVG or PNG); apple-touch icon on iOS "Add to Home Screen"; the `og:image` preview in a Slack/Teams link unfurl; case-exact asset URLs under `/LED_Configurator/`.
- 800 px and 500 px widths: monogram swap; a screen reader reads the heading as "Morph LED Configurator" at both.
- Pilot mode at 1100 px window width: watermark hidden, no overlap.
- Windows high-contrast mode: the logo `<img>` stays visible (images are not recoloured by forced colours).
- Camera preview on with the default wall, a Signal Red section and a Steel section: the frustum stays visible where it meets each, and the camera body's outline stays visible in front of the Signal Red section.
- "Show frame" on with all 8 palette colours (8 sections), then with panel IDs on: every frame line is visible (dark on light sections, light on Signal Red and on the textures).
- A section selected over the default wall and over a Signal Red section: the selection badge's red bar and the preview-window border keep their Morph Black neighbour; the active swatch ring is visible on Studio Grey.
- With spec 02's selection outlines: no dense dash cluster on any closing edge (6.6).
- Visual comparison against the prototype screenshots (except the superseded values, see Prototype notes).

---

## 9. Acceptance criteria

1. `index.html`, `css/` and `js/` contain no reference to Fivefold, no `.company-logo`, no legacy token name, no Outfit font, and no "LED Wall Configurator" string (R-B3a and R-B3b pass).
2. `document.title === 'Morph LED Configurator'`; the head contains a valid `<meta name="author">` and `theme-color #0A0A0A` (T4a), and an SVG favicon (listed last, `sizes="any"`), 64/128 px PNG fallbacks and an apple-touch-icon (T4b). All return HTTP 200 on GitHub Pages.
3. The header is one `<h1>` whose accessible name is "Morph LED Configurator" at every width. After T4b it shows `morph-wordmark-dark.svg` at 144 px width (rendered height 41.75 ± 0.5 px, aspect 507:147 ± 0.5%) followed by a divider and "LED Configurator". At ≤ 900 px only the wordmark is visible (the name is visually hidden, not removed); at ≤ 520 px the 36 px monogram replaces the wordmark.
4. The viewport shows `morph-monogram-dark.svg` at 44 px width, with its left edge 20 px from the gizmo column's right edge and its vertical centre within 1 px of the first gizmo button's centre, at full opacity with no CSS filter. It is not visible while `#pilot-info.visible`.
5. No logo artwork is modified: the files in `assets/brand/` are byte-identical to `Morph Brand Assets/Logos/…` (SHA-256 compared once at import), and no CSS rule applies `filter`, `opacity < 1`, `mix-blend-mode`, a non-proportional `height`, or `object-fit: fill` to a brand `<img>`.
6. Exactly one element uses Pivot Gold (`#export-zip`, class `export-btn--primary`), with Morph Black text (R-B5; U6).
7. Every pair in 3.12 meets its threshold (U5). Every Signal Red indicator has an opaque neighbour `<= #161616`: the selection badge is an opaque `#111111` chip with a Morph Black outer ring, and the preview window's red border, the pilot banner and the active pilot button have a Morph Black outer ring. The active swatch carries the two-tone ring.
8. The scene background, grid, frames (adaptive), camera body (with its outline), frustum (two-tone), safe-zone band, line and label, the canvas background, and the status colours equal the values in 3.8, read from CSS through ThemeBridge. **Override test (U2):** a reader that returns a different value for `--scene-frame` changes the bridged `scene.frame` leaf while `Theme.js` stays untouched. That is the runtime CSS-override benefit. A permanent change is the token and its `Theme.js` fallback in one commit, kept equal by U4 (D7).
9. `buildTheme` returns an object with `Theme`'s exact shape and leaf types. Its objects and arrays are frozen; its functions are shared and never frozen, so `Theme` is not mutated. It never throws for missing or malformed tokens, and it warns once per variable name with the documented message (U2, U3). Token parity holds at every step, with `App` and U4 using the same `BIND_FONTS_DEFAULT` (U4). Every Theme colour leaf is bound or `UNBRANDED` (U10).
10. Gizmo axis colours, panel-ID R/G/B borders, the spec 01 face-orientation colours and the prop colours are unchanged: every `UNBRANDED` leaf `Object.is`-equals its Phase-1 value, and the face-orientation leaves equal spec 01's values (U11).
11. The default first section colour is `#d9d9d6`; added sections cycle through the 8-colour palette of 3.9 (Steel `#6c6c6c`); the card shows 8 palette swatches plus the custom input on one row; U7 passes.
12. v1 files without section colours import with the legacy colours (before and after spec 07 D3); files with colours keep them byte-for-byte in the next export.
13. Exports use `Brand.files` names derived from `Brand.filePrefix = 'morph-led-wall'` (ZIP `morph-led-wall-export.zip`, PNG `morph-led-wall-panel-ids.png`), the ASCII headers of 5.4 and glTF `asset.generator === 'Morph LED Configurator'`. Material and object names are unchanged. `Brand.files.hdriPixelMap` exists for spec 05 (U9).
14. With spec 07 D4 (and after T6a), the v2 JSON's first keys are `version`, `generator`, `format`. The 2nd key is `generator: {name: 'Morph LED Configurator', version: APP_VERSION}`, composed from `Brand.jsonGenerator` and the injected `appVersion`. Importing a file with any or no `generator` behaves identically, and no project file carries a timestamp. With T10: `panel_id_style.brand_mark_on_export` round-trips in every variant (`file`, `zip`, `history`, `autosave`), and `version` equals `'2.' + KNOWN_REVISION`, one minor revision above the pre-T10 value.
15. After T5, Montserrat (400-700) and JetBrains Mono (400-700) are the only web fonts requested; canvas panel-ID labels render in JetBrains Mono Bold (weight 700 loaded). The font gate never rebuilds in the harness. It loads each pending (font, text) pair with its own text and calls `rebuildIfPanelIds` exactly once when anything was pending (`font-gate.test.mjs`). `rebuildIfPanelIds` rebuilds only with panel IDs on (`wall-controller.test.mjs`, row `F6-1`).
16. T2 and T3 each produce a harness run with **zero** differences against the previous baseline. T1's run is IDENTICAL under `--ignore-keys classes,class`, and without it differs only in the `classes` (`styles.json`) and `class` (`text.json` and the three logo-list probes) keys of the elements listed in 8.4. T6b's run is IDENTICAL under the `--rename` map.
17. Each of T4a, T4b, T4c, T5, T6a, T7 and T10 produces differences only in the outputs listed for it in 8.4, reviewed and re-baselined in its own commit:
    - T4b's screenshot differences lie inside the watermark rectangle (the page captures: the header and the watermark; `ui_visual` `00_initial` also the re-rasterised toolbar columns and help badge, 8.4);
    - T5's 35 `statusColor` files are IDENTICAL under `--ignore-keys statusColor`;
    - after T4a the selection badge and the help badge never overlap (B-L24's overlap half), also where the help text wraps to two lines (windows below about 1073 px; the anchored stacking of 5.2).
18. After T9, `assets/brand/` contains exactly the 8 files of 5.8 plus `NOTICE.md`, added only after the owner's recorded approval; `Morph Brand Assets/` is still git-ignored and untracked. R-B4 passes at every commit from T4b on.
19. README shows the Morph lockup in both GitHub themes (via `<picture>`), uses the product name, and states that the Morph marks are excluded from Apache-2.0.
20. (T10) With "Morph mark on panel-ID PNG" on, `morph-led-wall-panel-ids.png` shows the monogram (or the favicon below 32 px) in the bottom-right panel's corner per 6.5, or in the bottom-left panel's corner when a section logo occupies the bottom-right, or no mark when both are occupied. Viewport textures and ZIP textures never show it. Toggling it triggers no rebuild. With the toggle off, the PNG is identical to T5's.
21. Every two-tone overlay, the adaptive frames, and the outlined camera body and HDRI marker keep ≥ 3:1 against the scene background and every palette colour (U5, U13). Every bound or non-exempt colour, including the sibling keys of 5.12, is ≥ 20 ΔE00 from Pivot Gold and ≥ 15 from the legacy cyan and magenta; the `scene.debug.*` keys are exempt from the second rule only (U6). The `gizmo_drag` scenario still finds the person, the camera body and all four handles after T5 and after T7 (its pick and handle JSONs are identical), and `keyboard`/`ui_visual` still pick the person on the new default wall (T7).
22. No new keyboard shortcut, event, `Strategies` key or render layer exists; the only new rebuild call site is ARCHITECTURE 6.2 row `F6-1`; the unit and static gates are green.
23. No dashed outline uses `LineLoop`: every dashed overlay is built from `LineSegments` or a closed `Line` whose last vertex equals its first, and shows no dash artefact on its closing edge (U12, 8.5).
24. The stylesheets link in the order of 5.2 with `css/99-utilities.css` last; no two specs claim the same stylesheet number; `css-slices.mjs` runs `--report-only` per spec 07 S7 (it is not deleted).
25. (T10) The toggle uses spec 07 X1's switch markup and `bindSwitchKeys` once X1 has landed. Toggling it records one History entry (`Morph mark on PNG on/off`, coalesce key `panelIdStyle:brandMarkOnExport`) once H1 has landed. It is mirrored from the model on `PROJECT_REPLACED`, so undo, redo and Open restore it.

---

## 10. Task breakdown

| # | Task | Effort | Depends on |
|---|---|---|---|
| T1 | Inline styles → classes (`99-utilities.css`, linked last), the logo-row and offset-hint template classes, dead CSS removal (`.grid-lines`, `.section-color-0..7`), `css-slices.mjs --report-only` per spec 07 S7 (if E1 has not done it), R-B2, `compare.mjs --ignore-keys`. Harness: only class keys differ (8.4). | M (1.5 d) | Phase 1 merged |
| T2 | `theme/ThemeBridge.js` (pure: `parseHexColor`, `parseCssColor`, bindings, `UNBRANDED`, `BIND_FONTS_DEFAULT = false`, `buildTheme` with the function-skipping `deepFreeze`) + U1-U3 (including the override case of AC 8). Not wired. Harness: identical. | M (1 d) | T1 |
| T3 | Layer-4 tokens with legacy values (plus spec 01's tokens whose keys have landed, with spec 01's values: as built, the four debug-view tokens `--scene-face-front`, `--scene-face-back`, `--scene-normals`, `--scene-normals-face` and their `COLOR_BINDINGS` rows, since 01 F1-1 added `scene.debug`; `--scene-wall-back` and its row arrive with `scene.wallBack` in 01 F1-5, because a row needs its key (U2) and a token lands with its row and its fallback in one commit (5.12 rule 1)); the `App` line (no `bindFonts` option); `.status-*` classes to `--status-*`; U4 (parity against the legacy `Theme.js`, colour leaves only while `BIND_FONTS_DEFAULT` is false), U10, U11. Harness: identical. | M (1 d) | T2 |
| T4a | **Ungated chrome.**<br>- Token layers 1-3 with brand values, and every CSS rule rewritten to roles (about 860 lines; legacy token names and colour literals deleted; sibling feature CSS migrated).<br>- Text-only `<h1>` header; Fivefold logo deleted; title, author, description, `theme-color`, `color-scheme`, OG text; Montserrat in CSS (T4a font URL).<br>- Component states (3.5): the opaque selection badge with its outer ring and its `bottom: 64px` stacking above the help badge (B-L24's overlap half; 07 C52), the preview-window ring and the two-tone active swatch ring; `.view-btn.active` (spec 01 T7's rule) mapped to role tokens; emoji → SVG; resize-grip `currentColor`; gizmo icon size.<br>- The header grid of 3.2 with its history-group slot (07 C50; whichever of T4a and 07 H2 lands second fills it).<br>- `.section-row { align-items: end }` and 0.06em label tracking, then the label-fit check (8.4).<br>- Spec 07 contrast test retargeted (U5 UI rows); U6 layers 1-3; R-B1, R-B3a, R-B5.<br>- U4 stays green without change: `BIND_FONTS_DEFAULT` is still `false`, so the new `--font-ui`/`--font-mono` tokens reach the DOM only and are not compared with the legacy canvas font strings of `Theme.js` (8.1 U4).<br>- Harness `ui-spec`/fonts/text-probe edits; two harness runs and a review of every screenshot diff; re-baseline. | L (3.75 d) | T3 |
| T4b | **Owner OK required (Q2).** Copy the 6 assets + `NOTICE.md`; favicon/apple-touch/`og:image`; wordmark lockup, divider and monogram swap; watermark; `ui-spec`/text-probe additions; the review with `compare.mjs --diff-bbox` (added by 01 T2); R-B4; re-baseline. | M (1 d) | T4a, Q2 approved |
| T4c | British copy (Q14) in markup, the card template and the logo-row template (the "Centre" options), plus the field labels on T4a's label-fit list; re-baseline the 60 files (card and logo-row text) + `ui_visual` text and screenshots. | S (0.5 d) | T4a (it needs the label-fit list; recommended right after T4a) |
| T5 | Scene/canvas token values, `--scene-overlay-halo`, `--scene-frame-on-light`; `Theme.js` opacities, keys (`frameOnLight`, `cameraBody.outlineColor`, frustum dash keys) and fonts; `CameraRigView` two-tone frustum and body outline; `LEDWallView` adaptive frames + `render/frameColor.js` (U13); U12 for the frustum; `BIND_FONTS_DEFAULT = true` (U4 then checks fonts too); final font URL; `fontGate.js` + `PanelIdRenderer.takePendingFonts` + 6.2 row `F6-1` + `font-gate.test.mjs` and the row-`F6-1` `WallController` case; U6 layer 4; harness font lists and colour matchers; re-baseline screenshots, PNGs and the 35 `statusColor` files (with the `--ignore-keys statusColor` cross-check). | M (2.25 d) | T4a |
| T6a | `Brand` header and generator strings, `Brand.jsonGenerator` (if spec 07 D4 has not added it) with the Morph name, `shortName`/`company`/`homepage`, the `LEGACY_BRAND` test fixture, U9 strings; re-baseline the header lines (and `generator.name` iff D4 has landed). No `filePrefix` yet. | S (0.25 d) | T3 |
| T6b | `Brand.filePrefix` and `Brand.files` derived from it (+ `hdriPixelMap`) in one commit; `compare.mjs --rename`; U9 files and the `files.json === filePrefix + '.json'` invariant; `tests/unit/io.test.mjs` golden paths and `ProjectIO` log assertions derived from `Brand.files`; mapped compare must be IDENTICAL; re-baseline. | S (1.0 d) | T6a |
| T7 | Palette (`Theme.js`), `createDefault` injection, `SectionListPanel` swatches from the palette, v1 legacy fill, U5 scene rows, U6 palette, U7/U8, harness swatch selector and the re-derived person predicate (8.3) with its debug-dump check; re-baseline. | M (1.25 d) | T3 (after T5 if both are queued, so U5 scene rows see final values) |
| T8 | Spec 07 integration check: verify C11 (`migrateV1toV2` already reads `legacySectionColors`) and `generator` (2nd key, `{name: Brand.jsonGenerator.name, version: APP_VERSION}`), one unit assertion each; no spec 07 amendment. Harness: identical. | S (0.25 d) | spec 07 D3/D4, T6a, T7 |
| T9 | README (`<picture>` lockups, name, tagline in own words, badge colours `C51622`/`0A0A0A`, Brand-and-licence section), copy the 2 README lockups (gated), the GitHub social preview (owner uploads), harness README. Without Q2: a text-only README. | S (0.5 d) | T4b (or T4a for the text-only README) |
| T10 | Optional: `BrandMark`; `PanelIdStyle.brandMarkOnExport`; `WallController.setBrandMarkOnExport` with its History row; `#toggle-brand-mark` in `ExportPanel` (X1 switch markup and `bindSwitchKeys` if X1 has landed; `syncFromModel` on `PROJECT_REPLACED` if D5 has landed); the `PanelIdRenderer` logo-rect API (`#drawSection` → `{canvas, logoRect}`) with its 9-position tests; `atlasCanvas` options + logo collision; `ProjectIO`; the spec 07 schema row, F6's one revision bump (number assigned at merge, `ProjectSchema.REVISIONS`, 07 C40) with `KNOWN_REVISION`, the round-trip and reachability tests; the `brand_mark_png` scenario. | M (1.75 d) | T4b (Q2: it loads `morph-monogram-dark.svg` and `morph-favicon.svg`), T5, T6b; persistence part: spec 07 D4; mirror: D5; History row: H1; switch markup: X1 |
| (T11) | **Dropped (07 C52, C58).** `.view-btn.active` is spec 01 T7's; the badge stacking (`bottom: 64px`) is in T4a. | – | – |
| T12 | ARCHITECTURE/REFACTOR_PLAN amendments (5.11), each in the commit of the step it documents. | S (0.5 d total) | each step |
| T13 | Follow-up: self-host Montserrat + JetBrains Mono woff2 under `assets/fonts/` with `OFL.txt` (removes the Google Fonts request; harness works offline for fonts); `@font-face` in a new `00-fonts.css`. | S (0.5 d) | T5 |

**Total:** about 17.25 days: ≈ 15.0 days core (T1-T9 + T12) and ≈ 2.25 days optional (T10, T13). Revision 3.1 drops T11 (0.5 d, a duplicate of spec 01 T7's B-L24 work, 07 C58); T4a absorbs the badge offset within its existing re-baseline. T4 as a whole (T4a + T4b + T4c) is 5.25 days. Revision 3 adds about 1.75 days over revision 2: the adaptive frames and the outlines in T5, the reconciliation and harness fixes in T6b and T7, and the History/switch/logo-rect work in T10, partly offset by the smaller T8.

**Critical path:** Phase 1 → T1 → T2 → T3 → T4a → T5 → T7. The owner's approval gates only T4b, the README lockups and the optional T10, which sit off the critical path. T6a/T6b can run in parallel with T4a/T5 after T3, and T4c right after T4a, but their re-baselines are serialised (one harness re-capture at a time).

**If Q2 = no:** ship T1-T3, T4a, T4c, T5-T8 and the text-only header and README of T4a/T9. T4b, the README lockups and T10 (which needs the two published mark files) are dropped; nothing else depends on them.

---

## 11. Risks and open questions

### 11.1 Risks

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | Publishing the brand files is irreversible (public repo, Pages, forks, caches) | certain once done / high | Owner OK gate (Q2) on T4b, the T9 lockups and T10 only, the minimal 8-file set, NOTICE, the check-ignore guard for the private folder |
| R2 | Brand-rule interpretation (proportional clear space, gold counting, watermark on live content) differs from the brand owner's intent | medium / medium | Explicit questions Q3, Q6, Q7; the prototype and its screenshots (`Morph Brand Assets/prototype/`, private) to show the brand owner before T4b |
| R3 | Harness churn hides an unintended change inside an intentional re-baseline | medium / high | Three proven-identical steps first; T1 cross-checked with `--ignore-keys`; T6 split so header changes are reviewed in place (T6a) and renames are proven byte-identical (T6b `--rename`); T4b diffs bounded to the watermark rectangle; T5's 35 `statusColor` files cross-checked with `--ignore-keys statusColor`; one intent per step with an exact output list (8.4), recorded as its `--expect` manifest |
| R4 | Canvas text drawn before web fonts load (panel IDs, safe label) | low (preloads) / low | Font gate (5.6) with a deterministic trigger; the harness preloads fonts; the safe-label limitation is documented |
| R5 | ThemeBridge reads tokens before CSS applies, or a token is renamed | very low / medium | HTML spec ordering (deferred scripts wait for script-blocking sheets); fallbacks equal to CSS (U4); one warn per variable |
| R6 | Spec 07 U3 switches on colour management and sRGB output, and scene colours shift | certain (Track F, after F5) / medium | **U3 owns the switch** (07 C54). With `ColorManagement` enabled, three converts hex material colours from sRGB automatically, so ThemeBridge needs no linear kind; U3 handles the raw vertex colours (`setRGB(…, SRGBColorSpace)`) and canvas textures (`colorSpace`) and updates the harness matchers and spec 01's palette (5.12 row) |
| R7 | GitHub Pages is case-sensitive; Windows is not | medium / medium | R-B4 exact-case check; the Pages smoke test |
| R8 | The white monogram is lost over a light wall when zoomed in | medium / low | Accepted (no plate allowed); Q6 offers "off" or "only while the header lockup is not on screen" |
| R9 | New overlays from specs 01, 04 and 05 collide with the watermark | low / low | The reserved zone (3.3) is written into this spec and into 5.12 |
| R10 | Google Fonts sends visitors' IP addresses to Google (EU GDPR rulings on embedded Google Fonts) | medium for a business site / medium | T13 self-hosting (recommended), unchanged legacy behaviour until then |
| R11 | Future tokens or sibling theme keys break contrast or reintroduce gold or the legacy identity | medium / low | U5, U6 and U10 run on every change to `02-tokens.css` or `Theme.js`; the 5.12 rules |
| R12 | Sibling specs land before T4a with CSS on legacy tokens, or after it with stale examples (`var(--accent-cyan)`) | high / low | 5.12 rule 4; T4a's sweep; R-B3a fails the build on any legacy token name |
| R13 | The two-tone dashed frustum reads as busier than a plain line | medium / low | Dash 0.15 m / gap 0.10 m is about 13 px at the default orbit distance; Q21 lets the owner choose Signal Red single lines instead, accepting their loss on red/grey sections |
| R14 | A colour matcher in the harness picks the wrong object after the scene colours change | medium / medium | Matchers re-derived from the new blends (8.3); T5 requires every `gizmo_drag` pick and handle JSON to stay identical, so a mis-pick fails the step instead of being re-baselined |
| R15 | Adaptive frames cannot guarantee contrast on HDRI content (arbitrary images) or with free-string custom colours | medium / low | Light frames on textures and non-hex colours (6.7); every hex colour gets ≥ 3.65:1; HDRI content is a previs view where frames are optional |
| R16 | A sibling spec (02, 03, 05) implements its dashed outline with `LineLoop` anyway | medium / low | 5.12 rule 3 and 6.6 forbid it; U12 walks the built helpers and fails on a `LineLoop` with a `LineDashedMaterial` |
| R17 | The re-derived person predicate (T7) picks a non-person pixel on a future palette or wall colour | low / medium | The predicate is derived from the blends in 8.3, rejects every palette colour and grey, and T7 requires the pick JSONs IDENTICAL plus a debug-dump check of the picked pixel |
| R18 | Sibling specs and spec 07 drift again on the JSON envelope or the per-key theme contract | medium / medium | This spec defers every envelope rule to spec 07 section 0 and restates spec 01 CR-8 verbatim in 5.12; a later change to either is made there first and mirrored here in the same commit |

### 11.2 Open questions for the owner (each with a recommended default)

| # | Question | Recommended default |
|---|---|---|
| Q1 | Product name? | **"Morph LED Configurator"** (header: wordmark │ "LED Configurator"). Alternatives: "Morph Stage Configurator", "Morph LED Wall Configurator". |
| Q2 | May the 8 files of 5.8 be committed to the public repo (and therefore published on GitHub Pages)? | **Yes, exactly those 8**, after you confirm in writing. **Decided 2026-10-16: approved**, exactly the 8 files of 5.8 with `NOTICE.md` (IMPROVEMENT_PLAN §8, A8). If no: ship T1-T3, T4a, T4c, T5-T8 with the text-only header ("Morph LED Configurator" in Montserrat 600, sentence case, not styled to look like the wordmark), no watermark, no favicon, a text-only README. |
| Q3 | Clear space: scale the kit's 24/32 px with the rendered artwork, minimum 6 px? | **Yes** (the only reading under which any logo fits a 60 px header). |
| Q4 | Is the brand typeface Montserrat? (Identified visually; the PDF has no font names.) | **Montserrat** 400/500/600/700. |
| Q5 | Keep Google Fonts or self-host? | Google Fonts in T4a/T5 (smallest diff), then **self-host in T13**. |
| Q6 | Viewport watermark: always on, off by default, or only while the header lockup is not on screen? With it on, a default screen shows **two copies of the mark** (header wordmark, viewport monogram) and **up to three gold points** (one in each mark, plus Export All when the export section is in view). | **Always on**, hidden in pilot mode, because its purpose is the viewport crops and recordings that leave the header behind. If the brand owner counts the duplicate mark against the layout, the fallback is "off by default" with a View toggle later (no schema change; a spec 07 `Prefs` key). |
| Q7 | Pivot Gold only on Export All (ZIP)? And do the gold points inside the logo artwork count toward "one strong gold moment per layout"? | **Yes**, gold only on Export All. The logos' own gold points are part of the marks and are **not** counted as layout gold. This is a judgement call, not a rule from the kit, so it needs the owner's (or the brand owner's) confirmation together with Q6. |
| Q8 | Default first section colour? | **Studio Grey `#d9d9d6`** (neutral, readable LED-sim, neutral MTL, the wall stands out from Morph Black). Alternative Signal Red. A mid-dark default would fix overlay contrast but lose the wall's silhouette (about 1.6:1 against the background), so overlays are made two-tone instead (Q21). |
| Q9 | Re-colour the person and car props? | **No** (harness picking; spec 05 replaces the car). |
| Q10 | Keep the panel-ID R/G/B border cycle? | **Yes** (crews use it during line-up). |
| Q11 | Export filename prefix? | **`morph-led-wall`** (`Brand.filePrefix`); a project-name slug can be added once v2 stores a project name (spec 07 `project.name`). |
| Q12 | Version in exports? | JSON `generator.version = APP_VERSION` (spec 07 `core/AppInfo.js`, bumped manually per release; each bump re-baselines the JSON outputs); glTF generator **without** a version. |
| Q13 | Morph mark on panel-ID PNG exports? | **Optional, off by default**, combined PNG only, toggle next to "Export Panel IDs"; no PNG metadata chunk. |
| Q14 | British English UI copy ("Colour"), and shorter field labels where Montserrat wraps them? | **Yes, visible labels and tooltips only** (JSON keys unchanged), as its own step T4c, including the labels on T4a's label-fit list (default: "Angle Between Panels (°)" → "Panel Angle (°)"). |
| Q15 | Replace emoji in the pilot banner and preview header with SVG icons? | **Yes.** |
| Q16 | README lockups? | Light theme `morph-primary-horizontal.svg`, dark theme `morph-dark-event-lockup.svg`, 320 px, via `<picture>`. |
| Q17 | Trademark owner name and NOTICE wording? | Owner to supply the legal entity; placeholder "Morph" until then. |
| Q18 | Rename the repository (e.g. `Morph-LED-Configurator`)? | **No** (it would change the Pages URL and break links; the display name is enough). |
| Q19 | Spec 03 Q10: make the pivot OBJ header unconditional during the branding re-baseline? | **No**; keep it conditional (identity-pivot exports unchanged). |
| Q20 | v1 imports without colours: fill from the legacy palette? | **Yes** (old files look as authored; v2 uses the new palette). Spec 07 has already adopted this as C11; T8 only verifies it. |
| Q21 | Frustum and 3D selection outlines: two-tone (light dashes over a Morph Black halo) or single Signal Red lines? | **Two-tone** (≥ 3:1 on the background and every palette colour). Single Signal Red lines are 3.31:1 on black and 4.23:1 on the default wall but about 1.0-1.3:1 on Signal Red, Iris and Steel sections. |
| Q22 | Steel swatch: `#6c6c6c` (Morph Muted) instead of the prototype's `#7f7f7f`? | **Yes** (deuteranopia pairwise distance 13.1 instead of 6.6, normal pairwise 25.3 instead of 24.0). The cost: the minimum distance to the background drops from 38.1 to 31.0 in normal, deutan and tritan vision (still above the 25 floor; the all-mode minimum stays 26.1, set by Signal Red), and contrast on black from 4.94 to 3.77. |
| Q23 | Panel frames: adaptive solid frames (light `#D4D4D4` or dark `#0A0A0A` per section) or two-tone dashed frames? | **Adaptive** (≥ 3.65:1 for any section colour, solid lines, quieter than dashes across every panel edge). Two-tone dashed frames would also pass, but they are busier. |
| Q24 | Spec 01's debug colours (lime normals, magenta face normals): exempt them from the "≥ 15 ΔE00 from the legacy cyan/magenta" rule? | **Yes**, debug-only colours are not identity colours (5.12 rule 2); the gold rule still applies to them. The alternative is Rose `#E68AC0` for face normals, which is a palette colour and vanishes over Rose sections. |
| Q25 | Selection badge: opaque `#111111` chip with a Morph Black outer ring (red bar ≥ 3:1 over any scene), or keep the translucent chip and accept 2.6-2.7:1 over light walls? | **Opaque + ring.** |
