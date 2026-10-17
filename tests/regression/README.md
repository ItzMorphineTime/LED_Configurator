# Golden-master regression harness

A black-box, zero-dependency harness that drives the Morph LED Configurator (the LED Wall Configurator until
Feature 6 renamed it, 06 T6a) in headless Chrome,
captures every export and observable UI state, and compares a candidate build against a
baseline. In Phase 1 the baseline was captured from the original single-file app; from Phase 2 on
it is the output of the parent commit, and every intended change is declared in an
expected-change manifest (see [Phase 2 re-baselining](#phase-2-re-baselining)).

It talks to the page **only through the DOM**: element ids, classes and data attributes,
clicks, value changes followed by `input`/`change` events, real keyboard and mouse input through
the DevTools protocol, and the hidden `#import-input` file input. It never calls app functions or
reads app globals, so the same harness runs unchanged against the original `index.html` and the
ES-module refactor.

## Requirements

- Node.js 22 or newer (uses the built-in `WebSocket` and `fetch`). No `npm install` needed.
- Chrome, or Edge as a fallback. Set `CHROME_PATH` to use a different binary.
- Internet access. The app loads three.js r128 and JSZip 3.10.1 from cdnjs, and its fonts from
  Google Fonts. Failed requests are recorded as `network` errors, and the runner exits non-zero.

## Commands

```bash
# 1. Capture the baseline from the pristine original (once)
node tests/regression/run.mjs --root <dir-containing-original-index.html> --out <baselineDir>

# 2. Capture the candidate from the working tree (serves the repo root over http)
node tests/regression/run.mjs --root . --out <candidateDir>

# 3. Compare (exit code 0 = pass, 1 = at least one FAIL, 2 = usage error)
node tests/regression/compare.mjs <baselineDir> <candidateDir> [--tolerance 1e-5] [--verbose]
```

Useful options:

| Option | Tool | Meaning |
|---|---|---|
| `--only a,b` | run, compare | Limit to the named scenarios. `run` merges the results into an existing manifest: other scenarios' entries and files are kept, `meta` keeps the original capture's provenance, and the refresh is logged in `meta.partialCaptures` (with a warning if the browser, root or page differ). For local iteration only: a gate run is always full. |
| `--expect a.json[,b.json]` | compare | Gate a re-baselining commit against its expected-change manifests; also loads `expected/_nondeterminism.json`. See [Phase 2 re-baselining](#phase-2-re-baselining). |
| `--list` | run | List the scenarios. |
| `--page index.html` | run | The page to open under `--root`. |
| `--chrome <path>` | run | The browser binary. |
| `--tolerance 1e-5` | compare | Absolute tolerance for numbers in OBJ, MTL, glTF and JSON. |
| `--png-threshold 0` / `--png-max-percent 0.01` | compare | Exported PNGs fail when more than this % of pixels differ by more than the threshold. |
| `--shot-threshold 8` / `--shot-max-percent 0.5` | compare | The same check for viewport screenshots. |
| `--verbose` | compare | Print every output, including identical ones. |
| `--diff-bbox` | compare | Add the bounding box of the differing pixels (and of those outside an entry's `rects`) to every differing image. See [Rect allowances](#rect-allowances---diff-bbox-and-the-palette-hook-01-t2). |
| `--ignore-keys a,b` | compare | Drop these object keys, at any depth, from both sides of every JSON and state comparison (ZIP JSON entries included). A file that then compares equal is reported as equivalent (`PASS`), never as a difference. A review cross-check, not a gate: Feature 6 T1 runs it with `classes,class` to show that only the recorded class keys changed (`docs/improvements/06-morph-branding.md` 8.4), and T5 with `statusColor`. |
| `--rename old=new[,old=new]` | compare | Map the baseline's download file names to the candidate's before comparing: the file name in each output key (after the last `__`), each ZIP entry's last path segment, and every whole file-name token in the baseline's text outputs and text ZIP entries (`downloads.json`, the OBJ `mtllib` line, MTL `map_Kd`, glTF `images[].uri`, JSON texture paths, dialogs, console). `panel-ids.png` maps `textures/panel-ids.png` but not `morph-led-wall-panel-ids.png`. A review check of a rename commit (Feature 6 T6b: the mapped compare must be identical); its gate still declares the renamed outputs as removed and added. |

`run` only deletes an `--out` directory that is empty or holds a previous harness `manifest.json`.

## Baseline procedure

The golden master of the refactor is captured from the pristine `index.html` at commit `cd3fd3f`,
twice, and the two captures must agree. `tests/regression/output/` is git-ignored, so the copy of the
original page and every capture stay local:

```bash
mkdir -p tests/regression/output/original
git show cd3fd3f:index.html > tests/regression/output/original/index.html
node tests/regression/run.mjs --root tests/regression/output/original --out tests/regression/output/baseline
node tests/regression/run.mjs --root tests/regression/output/original --out tests/regression/output/baseline2
node tests/regression/compare.mjs tests/regression/output/baseline tests/regression/output/baseline2   # must exit 0
```

`git show` writes the committed (LF) bytes. A checkout with `core.autocrlf` has CRLF line endings
instead, which the HTML parser normalises, so either copy behaves identically; use `git show` so the
baseline is reproducible on every machine.

A candidate (the working tree) is then captured and compared against `baseline`:

```bash
node tests/regression/run.mjs --root . --out tests/regression/output/candidate
node tests/regression/compare.mjs tests/regression/output/baseline tests/regression/output/candidate
```

Run one harness process at a time (each one drives its own headless Chrome). Re-capture both
baselines whenever a scenario or a probe changes (`scenarios.mjs`, `scenarios-extra.mjs`,
`scenarios-phase2.mjs`, `configs.mjs`, `ui-spec.mjs`, `lib/`), and never re-capture them to make a
refactor candidate pass: a baseline changes only with a deliberate behaviour change (see
`docs/REFACTOR_PLAN.md`, section 6). This was the Phase 1 procedure; Phase 2 and every later
golden-changing commit use [Phase 2 re-baselining](#phase-2-re-baselining) instead.

## What runs

Each scenario starts from a fresh page load in a new tab. The page counts as ready when
`#total-panels` shows a non-zero number, `#three-canvas` has a size, and the fonts are loaded.
Configs are applied by importing a JSON file through `#import-input`. The harness then waits until
`#wall-sections` re-renders and `#total-sections` matches the config.

| Scenario | Outputs | What it covers |
|---|---|---|
| `default` | 27 | Default state with no import. Covers every mesh mode and export. |
| `flat3` | 28 | Three flat sections in a line. |
| `concave_offsets` | 28 | Concave sections with +15/−20° offsets. Import defaults are tested with a missing name, color and id. |
| `convex` | 28 | One convex section (−4°), imported with `mesh_mode: panel`. |
| `mixed` | 28 | Mixed panel sizes, LED resolutions and row counts, plus custom panel-ID border, font and section-label styling. |
| `box_corner` | 30 | Box layout from ±90° offsets, with section labels off. Also round-trips the JSON inside the ZIP. |
| `large_wall` | 27 | Stress test with 3,200 panels through every export. |
| `camera` | 27 | Frustum preview: filmback presets and custom size, focal length, position, rotation, clamping, the three status states, reset, safe distance, and Export Safe Distance OBJ. |
| `ui_sections` | 23 | Section cards: add, edit, clamp, the 4K warning, collapse and delete. Records stats and a structural snapshot after each step. |
| `toggles` | 34 | Wireframe, frames, each LED-sim layout in every mesh mode, panel IDs in every mesh mode, grid, person and car props, view buttons, orbit drag and wheel zoom. Each state gets a viewport screenshot. |
| `keyboard` | 27 | G, R, L, P and Escape. Also selects the person prop by clicking its pixels, then covers the gizmo, local space, and pilot mode via keys and the button. |
| `ui_visual` | 35 | UI and CSS: computed-style, text-content and canvas-masked screenshot snapshots across 10 UI states. See [The `ui_visual` scenario](#the-ui_visual-scenario). |
| `import_edge` | 49 | Import edge cases (B-L8): an empty wall with the preview and safe distance on, numbers imported as strings through every export, an unknown mesh mode, duplicate and string ids, and imports with no sections, `null` and malformed JSON. See [The extra scenarios](#the-extra-scenarios). |
| `logos` | 28 | Section logos with panel IDs on: upload, position, scale clamps, clear, and panel IDs off. Exports the panel-ID PNG and the ZIP after each texture change. |
| `name_with_panel_ids` | 13 | Renaming a section one real keystroke at a time with panel IDs on (title, logo list, PNG, JSON), then clearing the name. |
| `preview_off_in_pilot` | 12 | B-H4: turning the camera preview off in pilot mode alerts and stays in pilot. P and Escape alert again. |
| `pilot_look` | 9 | Pilot mouse-look drag: the rotation inputs, frustum readouts and preview labels. Also checks that the orbit ignores the wheel in pilot mode. |
| `gizmo_drag` | 20 | Gizmo drags on handles found by colour: the person's X arrow and Y ring, then the camera's X arrow and Y ring. |
| `preview_resize` | 9 | The camera preview resize handle: an aspect-locked drag, then the B-L32 clamp blow-out with a 100×10 mm filmback. |
| `normals_debug` | 34 | The normals debug view (01 F1-3): content-mode colour probes at four poses, then the lines, the popover, face orientation and normal colours, export, preview and picking isolation, keyboard and focus rules, the pilot legend, the popover fit and the box-corner face probes. See [`normals_debug`](#normals_debug-01-f1-3). |
| `p2_xss_names` | 14 | Phase 2: markup, quotes, spaces and duplicates in section names and a CSS-injecting colour (B-M4, B-L8, B-L14, B-M2, B-L21). |
| `p2_zip_section_mode` | 8 | Phase 2: `flat3` in section mode with a renamed section; MTL texture paths against the ZIP entries (B-M2, B-L7). |
| `p2_curved_safe_distance` | 11 | Phase 2: the safe-distance floor on four curved or cornered walls, screenshot and OBJ export each (B-M15, B-L29, B-M1). |
| `p2_zero_inputs` | 9 | Phase 2: zero and fractional inputs (B-L9, B-L15, Q13). |
| `p2_oversize_canvas` | 6 | Phase 2: a wall wider than the browser's canvas limit (B-L4). |
| `p2_mixed_content` | 7 | Phase 2: LED sim and panel IDs on mixed section heights (B-M5, B-L18). |
| `p2_shortcut_filters` | 8 | Phase 2: shortcut keys in a focused select, with Ctrl, auto-repeated, and a view preset in pilot mode (B-L11, B-L25). |
| `p2_project_v2` | 35 | Phase 2: a full project save and restore, a save with the preview off, hostile v2 logos and the stored SVG text; the only scenario with `network.json` (B-L31, B-L35, B-L36). |
| `p2_true_framing` | 11 | Phase 2, captured before 08 P2-11: Reset, coverage and D on the 18° half-circle wall and on a flat wall along +Z, a 90° pan, and a camera behind the default wall facing it (B-M10, B-L33, B-L2, Q13). |
| `preview_compositing` | 9 | 07 R2 and the owner's 2026-10-17 report: preview on, the window enlarged with its handle, two orbit drags; the WebGL canvases, full-page screenshots and the mirrored-rectangle probe. See [The platform scenarios](#the-platform-scenarios-07-r1r2). |
| `preview_clean` | 13 | 07 8.3: the person selected, preview and Safe Distance on, at Full Frame, RED V-RAPTOR and a 100×10 mm custom filmback dragged widest; canvas and window screenshots and the preview state. |

The eight scenarios after `ui_visual` live in [`scenarios-extra.mjs`](scenarios-extra.mjs) and are
spread into `SCENARIOS` after the original entries. The nine `p2_*` scenarios live in
[`scenarios-phase2.mjs`](scenarios-phase2.mjs) and are spread in after them (see
[The Phase 2 scenarios](#the-phase-2-scenarios)). The five `pivot_*` feature scenarios ([`scenarios-features.mjs`](scenarios-features.mjs))
follow, and the two platform scenarios ([`scenarios-platform.mjs`](scenarios-platform.mjs)) are registered last.

The six config scenarios follow the same steps:

1. Record stats, the mesh-mode radio state and a section snapshot after import.
2. Export JSON.
3. For each of combined, section and panel modes: Export OBJ, then Export glTF. Export OBJ downloaded the OBJ and the MTL
   that followed it ~100 ms later until 08 P2-6e; since then it downloads one ZIP (`<mode>__export-obj__morph-led-wall-obj.zip`:
   the OBJ, the MTL and, in section mode, the textures the MTL references), and the harness expects one download
   (`OBJ_ZIP_DOWNLOAD` of `lib/app.mjs`).
4. Switch back to combined mode and turn panel IDs on. Optionally apply styling, then take a screenshot.
5. Export Panel IDs PNG, then Export All ZIP, then Export JSON. Record the final stats.
6. Round trip: re-import the exported JSON and export it again.

## The `ui_visual` scenario

This scenario guards the UI against CSS and markup regressions, for example when styles move from the
inline `<style>` block into `css/*.css` files and scripts into ES modules. The other scenarios only see
the UI through canvas screenshots and structural snapshots. This one records three things for each
UI state:

- **Computed styles** (`NN_<state>.styles.json`): for each element listed in
  [`ui-spec.mjs`](ui-spec.mjs), the scenario records `getComputedStyle()` for a fixed list of about
  100 longhand properties (`STYLE_PROPS`), plus `getBoundingClientRect()` rounded to 0.5 px, the
  sorted class list, and how many elements the selector matched. `::before` and `::after` are probed
  where the CSS uses them: the toggle knobs, the section-title bar and the mesh-mode radio dot. Each
  file also holds the `:root` design tokens (`CSS_TOKENS`), the viewport size, and the sidebar's
  scroll metrics.
- **Text content** (`NN_<state>.text.json`): the document title and `lang`; header, stat,
  section-title, toggle and mesh-mode texts; every button (text, `title`, `aria-label`); every label;
  every select with its options; all `title`, `aria-label` and `placeholder` attributes; card titles,
  summaries, warnings and hints; the section-logo list; the overlay texts; and
  `document.body.innerText` line by line. `innerText` follows `display` and `text-transform`, so it
  shows the text a user actually sees.
- **Screenshots** with both WebGL canvases masked:
  - `NN_<state>.viewport.screenshot.png` is the whole 1600×1000 page. The page is a 100vh grid, so
    the viewport is the full page.
  - `NN_<state>.sidebar.screenshot.png` is the sidebar's full scroll height.

  `captureBeyondViewport` cannot reach content clipped by an inner `overflow: auto` container, so the
  scenario scrolls `.control-panel` through its height with `scrollTop`, captures each window, and
  stitches the slices into one PNG.

  Masking adds a `<style>` that sets `visibility: hidden` on `#three-canvas` and
  `#camera-preview-canvas`, only for the duration of each capture. The `.viewport` background and the
  preview window's black background show through instead. No WebGL output can reach these images,
  and the computed-style snapshots never see the mask.

States, in order:

| # | State | Styles | Text | Viewport | Sidebar |
|---|---|---|---|---|---|
| 00 | `initial`: the page as loaded | all groups except `card1` and `logos` | ✓ | ✓ | ✓ |
| 01 | `gizmo_translate`: person prop on, translate gizmo button active | overlay | | | |
| 02 | `selection_visible`: person selected by clicking its pixels, `#selection-indicator.visible` | overlay | ✓ | ✓ | |
| 03 | `gizmo_rotate_local`: rotate button active, space button in `local` | overlay | | | |
| 04 | `options_ledsim_camera_props`: LED sim, camera preview with custom filmback, safe distance (shows its export button), person and car options open | all groups except `card1` and `logos` | ✓ | ✓ | ✓ |
| 05 | `gizmo_pilot`: pilot button active, `#pilot-info.visible` | overlay | ✓ | ✓ | |
| 06 | `options_panelids_logo`: panel IDs open (this turns LED sim off) and a logo uploaded for the first section through its file input | all groups except `card1`, plus `logos` | ✓ | ✓ | ✓ |
| 07 | `two_sections`: a second section added and expanded | all | ✓ | ✓ | ✓ |
| 08 | `collapsed_and_4k_warning`: the first card collapsed, the second card over 4K (warning box and ⚠) | all | ✓ | ✓ | ✓ |
| 09 | `narrow_800`: 800×1000 viewport, the `@media (max-width: 900px)` layout | entries marked `layout` | | ✓ | |

LED sim and panel IDs cannot be open at the same time, so they are covered by two separate states.
The scenario also writes `selection_pick.json` (whether the person prop was found) and
`logo_upload.json`.

Before every capture the scenario does the following, so that captures are repeatable:

- It blurs the focused element, so no `:focus-within` border or caret shows.
- It parks the mouse at (2, 2), inside the header padding, which has no `:hover` rules.
- It scrolls the sidebar back to the top.
- It waits 400 ms and for running transitions. The toggle knobs animate for 0.3 s.
- It waits for `document.fonts.ready` and two frames.

At the start of the scenario, every Google Fonts weight is preloaded, including the unicode-range
subsets for `°×•—` (JetBrains Mono 400-700 and Montserrat 400-700 since 06 T5; Outfit and JetBrains Mono 300
are no longer served). The text
snapshot's `header.logo` is the text of `.product-name` (06 T4a; the legacy `.logo-text` is gone; since 06 T4b
"LED Configurator", with the alt texts of the lockup images in `header.brandAlt`), and `CSS_TOKENS` lists the role
tokens of `css/02-tokens.css` layer 3. Since 06 T4b the styles also probe the lockup images, the divider and the
viewport watermark (`.brand-watermark`, a direct child of `.viewport-overlay`, so the pixel searches of the extra
scenarios skip it like every other overlay).

Two self-consistency runs from the original app produced byte-identical outputs for all 35 files.

**Sensitivity check:** moving the whole `<style>` block into `css/style.css` behind a `<link>` produced
35 identical outputs. Changing `.toggle-label` to `font-size: 13.5px` and `.section-toggle` to a
0.25 s transition caused a FAIL in every style snapshot that probes the sidebar (states 00, 04, 06,
07 and 08), naming both elements. The overlay-only and narrow-layout snapshots don't probe those
elements, so they stayed identical.

**Editing the probe list:** `ui-spec.mjs` is data, in the same way as `configs.mjs`. Adding or
removing an entry or a property changes the recorded files, so re-capture the baseline from the
original app afterwards:

```bash
node tests/regression/run.mjs --root <original> --out <baselineDir> --only ui_visual
```

## The extra scenarios

[`scenarios-extra.mjs`](scenarios-extra.mjs) adds eight scenarios for code paths the scenarios above
never reach. They follow the same rules: DOM and DevTools-protocol input only, never app functions
or globals. Besides clicks and value changes they use real CDP key events (typing), CDP mouse drags,
`DOM.setFileInputFiles` (logo upload) and in-tab reloads (fresh pages inside `import_edge`).
Line numbers refer to `index.html@cd3fd3f`.

### `import_edge` (B-L8, empty wall)

`importJSON` (4967-5010) accepts anything with a `sections` array. Each sub-case records the import
result (`*_import.json`: whether `#wall-sections` changed, new dialogs, the reset input value), the
stats and a structural snapshot of the cards, and its dialogs (`<case>_dialogs.json`, recorded before
the next reload, because `dialogs.json` only holds the last page's dialogs).

| Case | Steps | Baseline behaviour |
|---|---|---|
| i | Preview and safe distance on, import `{"version":"1.0","sections":[],"mesh_mode":"combined"}`, then Add Section, Export OBJ, glTF and JSON | No error on import (the safe-distance group is built empty); stats `0`; Add throws `TypeError ... (reading 'panelCols')`; OBJ and glTF throw `TypeError ... (reading 'color')` from `sections[0]` (since 08 P2-1a both are M-EXP-1 alerts in `i_dialogs.json`); JSON downloads `sections: []` |
| ii | Fresh page; one section whose numbers are strings; Export JSON, then OBJ and glTF in all three mesh modes | Values stay strings in the cards and the JSON; the exports show the raw JS coercion |
| iii | Fresh page; `mesh_mode: "weird"`; record the mesh-mode labels and radios; Export OBJ and glTF; click the `combined` label | No label is active, the radios are untouched (`combined` stays checked), the wall and exports take the panel branch; the label click switches back |
| iv | Fresh page; ids `[1, 1, 2]` plus a section without id (gets id 3); delete the first card | Both id-1 sections disappear; both remaining cards are collapsed |
| v | Fresh page; id `"abc"`; Add Section | The new card gets id `NaN` (`data-id="NaN"`) and stays collapsed; the JSON writes `id: null` |
| vi-viii | Fresh page; import `{"foo": 1}`, then a file containing `null`, then malformed JSON | `{"foo": 1}` changes nothing; `null` and the malformed file each alert `Error parsing JSON file: ...` |

### `logos` (2189-2305)

Turns panel IDs on, writes a fixed 16×8 two-colour PNG (a base64 constant) to a temp file and sets
it on the first `#section-logos-container input[type="file"]` with `DOM.setFileInputFiles`, then
waits for `.section-logo-upload-btn.has-logo`. After the upload and after each texture-changing step
(position `top-left`, then `bottom-right`; scale `150` (written back as 100), `abc` (30), `25`) it
records the logo list (`logos_NN_*.json`: classes, select value, the `selected` attribute from the
render, the scale value) and exports the panel-ID PNG and the ZIP. Then it turns panel IDs off,
changes the position (stored, no rebuild), clears the logo with `.section-logo-clear` (the list
re-renders while hidden), turns panel IDs on again and exports the PNG without a logo. One viewport
screenshot shows the logo on the combined wall.

### `name_with_panel_ids` (4014-4023)

With panel IDs on, it focuses the first `.section-name-input`, selects its text and types
`Grip <i>L</i>` with real CDP key events, one key at a time. After each key it records the input
value, the `.section-title` text and `innerHTML`, and the logo-list text
(`name_01_per_keystroke.json`). The name contains markup, which the original's unescaped `innerHTML` (B-M4)
turned into an `<i>` element in the title and the logo list; since 08 P2-3a both show it as text. It also contains the shortcut letters g, r, p and l, so the gizmo
state recorded after typing proves that the shortcut handlers ignore INPUT targets (B-L11). Then it
exports the panel-ID PNG and JSON, clears the field with Backspace, and exports again: the model
falls back to `Wall 1` (title, logo list, JSON) while the input stays empty.

### `preview_off_in_pilot` (B-H4: 3477-3509, 4229-4249)

Turns the preview on and presses P (pilot on), then turns the preview off. The toggle-off handler
calls the pilot toggle after the preview flag is already false, so it alerts `Enable Camera Frustum
Preview first to use Pilot Mode` and stays in pilot mode (`#gizmo-pilot.active`,
`#pilot-info.visible`, the main camera keeps the pilot view). P and Escape alert again. Turning the
preview back on re-drives the pilot view, and P then leaves pilot mode. Each state records the gizmo
classes, the camera panel and the dialogs so far. Since 08 P2-4a (B-H4 fixed) turning the preview off leaves pilot
mode with no alert and restores the orbit view; the next P (preview still off) alerts once, as any entry with the
preview off; Escape deselects; the preview turned on again resets the camera; the last P enters pilot mode. The step
and output names keep their original wording.

### `pilot_look` (3477-3562, 3622-3631, 3835-3840, 4475-4479)

Turns the preview on, presses P, and drags on `#three-canvas` from the centre in six steps of
(+20, +6) px with the left button held: `#camera-rot-x` = `-10.8` and `#camera-rot-y` = `-36.0`,
with the frustum readouts, status and preview labels recorded too. A wheel event in pilot mode must
not zoom the orbit camera (screenshot), and P restores the orbit view (screenshot).

### `gizmo_drag` (2997-3474)

Handles are found by colour in a canvas screenshot, skipping the overlays and the preview window,
using the blended colours of the 0.35-opacity gizmo materials on the background (red X about
`(96, 30, 34)`, green Y about `(30, 96, 34)`). The search keeps only pixels whose 5×5 neighbourhood
matches, so the press always lands well inside the handle. Each `<part>_handle.json` records
`{ found: true }` (or `{ skipped: true, reason }`), never coordinates.

1. Person on, G, pick the person by its colour (as in `keyboard`), drag the right-most part of the red
   X arrow 60 px right in 6 steps: `#person-pos-x` / `#person-pos-z`.
2. R, drag the lowest part of the green Y ring 60 px right: `#person-rot-y` (the rotation is
   opposite to the drag, B-M12).
3. Person off (deselects), preview on, one orbit wheel step out (distance 8 to 12, so the film camera
   is not on the bottom edge), G, pick the camera body (Signal Red since 06 T5), drag the X arrow: `#camera-pos-*` and
   the camera readouts; then R and drag the Y ring: `#camera-rot-y`.

All four handles were found in both self-consistency captures of the original, so nothing is
skipped. Screenshots after each drag show the moved prop or rig and the gizmo following it.

### `preview_resize` (3647-3700)

Turns the preview on and drags `#camera-preview-resize` by (-100, -50) in 5 steps. It records
`#camera-preview-window` `style.width` / `style.height` / offset size, `#camera-preview-canvas`
`width` / `height` attributes and inline size: 320×180 becomes 420×280 (aspect-locked to 36×24 mm).
Then it selects the `custom` filmback, sets 100 × 10 mm and drags again. The height clamp (120 px)
recomputes the width from the 10:1 aspect, so the window grows to 1200×120 (B-L32). It also takes a
screenshot after each drag.

### `normals_debug` (01 F1-3)

`docs/improvements/01-normals.md` section 8.2 (T8). **Part A** (content mode) runs on every page, the original
single-file app included: at the poses `front`, `behind` (a 314 px orbit drag), and, after importing `box_corner`,
`boxP1` and `boxP2` (drags of 79 / -236 px right and 60 px down, then a wheel step of +700), it records
`content_probes.json`: whether the wall colour (or each box section's colour) forms a connected region of at least
400 px, and whether the cabinet colour does (always false until 01 F1-5 adds `SceneTheme.wallBack`: without a cabinet
colour no cabinet can be drawn). Each pose starts with `#view-reset` and `#view-front`; probes find sections by colour,
never by projection. On a page without `#toggle-normals` the scenario then writes `debug_skipped.json` and stops.

**Part B** runs on one fresh page (`AppPage.reload()`). Every step asserts its precondition against S0 (the bootstrap
state: combined, no props, preview off, no gizmo mode, debug defaults, popover closed, focus on BODY) and
`preconditions.json` lists each check (`precondition_failed` when one did not hold). The debug controls are driven through
the DOM (`el.click()` on the buttons, radios and checkboxes, input + change on the range), opening the popover when a
control is needed; an orbit drag closes an open popover (an outside pointerdown, 01 3.2).

| Step | Records |
|---|---|
| B0, B7 | The OBJ, MTL and glTF of each mesh mode, the JSON, the ZIP entries and the panel-ID PNG, hashed in memory with every debug option off (B0) and on (B7, popover open): `exports_isolation.json` (all `true`). |
| B1, B2 | `b1_lines_on.json` (button classes, `aria-pressed`, stats "24 vertex lines · 0.117 m"), `b2_popover.json` (focus after a keyboard-style open, stats with face lines and at ×2, the announcer 500 ms later); screenshots `b1_vertex_normals`, `b2_vertex_face`, `b3_scale2`. |
| B3, B13 | `face_probes.json`: a point found in a normal-colours capture (lavender +Z, teal -X, olive -Z) is sampled in the face-orientation capture and classified (blue = front, red = back), at `front` / `behind` for the default wall and at `boxP1` / `boxP2` for `box_corner`; screenshots `b4_face_front`, `b5_face_behind`, `b12_box_p1`, `b13_box_p2`. |
| B4-B6 | Screenshots in normal colours, in section and panel mode, wireframe on and off; `b5_rebuilds.json` (stats per mode, the shading after the rebuilds); `content_restored.json`: `b11_content` back in S0 against Part A's `a1_front`, overlays excluded. |
| B8 | `keyboard.json`: the state after each action of 01 8.2 B8 (n in a text input, Ctrl+N, Alt+N, N, Shift+N, pointer open, pointer change, N, G, Escape twice, keyboard open, ArrowDown, N inside the popover, Escape). |
| B9-B12 | `picking.json` (the person is selected with every line option on), `preview_isolation.json` (the preview canvas with lines on and off; `b10_preview_lines_on` is kept), `pilot_legend.json` (pilot starts, the legend shows below the banner, Escape exits), `popover_fit.json` (1366×650 and 800×760: inside the overlay, placement, scrolling, every control reachable). |

**No exact equality.** Every image comparison inside the scenario (`content_restored`, `preview_isolation`) uses
`lib/probe.mjs` `diffStats` with the overlay rectangles excluded and records only the verdict `withinJitter` (max
channel difference <= 1 and at most 16 differing pixels: the documented overlay jitter with a 2x margin); the raw
numbers are printed to the runner's stdout. Probe colours come from `readProbePalette(app)` (the live palette hook);
only the normal-colour triples are constants (the shader's convention).

**Library additions (01 T8).** `AppPage.screenshotElement(selector)` (`screenshotCanvas` is
`screenshotElement('#three-canvas')`), `AppPage.pointerClick(selector)` (CDP press and release at the element's centre:
pointer events, focus and click `detail` 1, unlike `click()`), `AppPage.overlayRects(selectors, origin)` (padded rects
of visible elements relative to the captured element), `keyPress(key, {modifiers, noText})` with the keys `n`, `Enter`
and `ArrowDown` and `MODIFIERS` (Alt 1, Ctrl 2, Meta 4, Shift 8), `findPersonPixel` exported from `scenarios.mjs`, and
`lib/probe.mjs` (`colorMask`, `largestComponent`, `probePoint`, `sampleRGB`, `classifyFace`, `diffStats`,
`withinJitter`, `readProbePalette`). Without options every existing call sends exactly the events it sent before.

**Library additions (03 T8).** `keyPress(key, {modifiers, noText, repeat})`: `repeat` marks the keyDown as an
auto-repeat (CDP `autoRepeat`); the keys `o` (the pivot selection) and `Tab`. `AppPage.drag(x, y, dx, dy, steps,
{modifiers, beforeRelease})`, moved here from `scenarios-extra.mjs` (whose three drags call it with the defaults): move,
press, `steps` moves with the button held, then `beforeRelease()` (for example Escape and more moves with the button
still held), then release and settle; `modifiers` is sent on every mouse event (Ctrl-drag snapping). Without options both
send exactly the events they sent before; the full capture of the change compared identical (03 8.3, T8).

### Sensitivity

Each extra scenario was run against a scratch copy of the original with one line of its code path
deliberately broken, and `compare.mjs --only <scenario>` against the baseline failed every time:

| Scenario | Broken line in the copy | Failing outputs |
|---|---|---|
| `import_edge` | import ids renumbered (`id: i` instead of `s.id !== undefined ? s.id : i`) | `iv_after_import`, `iv_after_delete`, `iv` JSON, `v_after_add`, `v` JSON |
| `logos` | position change ignored (`position = 'center'`) | the PNG and ZIP of steps 02-06 |
| `name_with_panel_ids` | no `Wall N` fallback on rename | `name_03_cleared`, its PNG, `name_04_after_exports` |
| `name_with_panel_ids` | shortcut guard no longer ignores INPUT targets | `name_02_gizmo_after_typing` (rotate and local space toggled), `dialogs.json` (pilot alert) |
| `preview_off_in_pilot` | the pilot toggle removed from the preview-off handler | every `pilot_0N` state from `01` on (one alert fewer), `dialogs.json` |
| `pilot_look` | pan sign flipped (`rotY += deltaX * 0.3`) | `look_01` and `look_03` (`36.0` instead of `-36.0`) and all three screenshots |
| `gizmo_drag` | rotation sign flipped (`angle = -angle * ...`) | `person_02_rotated`, `camera_02_rotated` and their screenshots |
| `preview_resize` | height clamp 100 instead of 120 | `resize_03_blow_out` (1000×100 instead of 1200×120) and its screenshot |

To see which pixels a handle search picked, set `REGRESSION_DEBUG_DIR=<dir>` when running `run.mjs`.
Every searched screenshot is then written there with a JSON file that holds the chosen pixel and the
excluded overlay rects.

## The Phase 2 scenarios

[`scenarios-phase2.mjs`](scenarios-phase2.mjs) adds the eight scenarios of
`docs/improvements/08-bugfix-roadmap.md` section 8.3, and `p2_true_framing` (B3-0, captured before 08 P2-11).
They were captured against the **unfixed** code, so their baselines document the bugs; each later fix changes
them on purpose, through its expected-change manifest. They follow the same DOM-only rules as the other scenarios.

- **Export labels** are `<mesh mode>__<button>` (`section__export-obj`, `combined__export-zip`, ...) or
  `<wall>__export-safe-distance`, so the segment-agnostic manifest patterns
  (`**/*section__export-obj__*.zip`, `**/*combined__export-*`) cover them like the config scenarios (before 08 P2-6e
  the OBJ and MTL were separate outputs, `**/*section__export-obj__*.mtl`; since then they are ZIP entries).
- **No reachable URL** is ever part of a payload: hostile URLs use the `.invalid` top-level domain,
  which never resolves. A request to one would be recorded as a `network` error, and
  `p2_project_v2/network.json` lists every request to another origin.
- **Fresh pages** inside a scenario use `AppPage.reload()`. Console errors and downloads keep
  accumulating across it, and it keeps the dialogs of the page it leaves, so `dialogs.json` lists the
  dialogs of every page of the scenario, in order.

| Scenario | Steps | Records |
|---|---|---|
| `p2_xss_names` | Import six 2×1 sections named `<b id="xss-probe">B</b>`, `Say "hi"`, `A B`, `A_B`, `Dup`, `Dup` (the third with the colour `red;outline:3px solid lime`) in section mode; probe; panel IDs on; probe; rename card 1 (the second card) to `<i id="xss-probe2">i</i>` with one `input` event; probe; `section__export-obj`, `section__export-zip` | `sections_initial`, `sections_renamed`, `xss_probe_0{0,1,2}_*` (`xss_probe`, `xss_probe2`, and per card whether the colour injected an outline), `logos_0{1,2}_*`, MTL, ZIP entries and ZIP JSON |
| `p2_zip_section_mode` | Import `flat3` in section mode, rename `Center` to `Center Stage`, `section__export-obj`, `section__export-zip` | `sections_renamed`, MTL, ZIP entries |
| `p2_curved_safe_distance` | For `concave_offsets`, `convex`, `box_corner` and the inline `concave30` (one section, 6 × 4 panels of 500 mm, curve +30°), each on a fresh page: import; preview on; camera at (3, 1.5, 6); safe distance on; screenshot `<wall>`; `<wall>__export-safe-distance` | 4 screenshots, the 4 OBJs (since 08 P2-5a; none while B-M1 threw), `console.json`, `downloads.json` |
| `p2_zero_inputs` | Preview on; camera Y and Z = 0; card 0 width 0 and columns 2.5; panel IDs on with border 0; `combined__export-obj` | `camera_zero`, `sections_zero`, `stats_zero`, `ui_zero_border`, OBJ and MTL |
| `p2_oversize_canvas` | Import one section of 70 × 2 panels with 1000 × 64 LEDs (a 70,000 × 128 px atlas) in section mode; `section__export-panel-ids`; `section__export-zip`; panel IDs on; screenshot `panel_ids_viewport` | `dialogs.json` (M-EXP-2 and M-EXP-4 since 08 P2-1c), `console.json` (empty since 08 P2-1a; the original threw a `TypeError` in Export Panel IDs), `downloads.json`, ZIP entries and MTL (the original shipped a 0-byte texture; since 08 P2-1c it is left out), the screenshot (the section colour since 08 P2-1d) |
| `p2_mixed_content` | Import `mixed`; LED sim on (combined), screenshot; layout `square`, screenshot; panel IDs on, screenshot | 3 screenshots |
| `p2_shortcut_filters` | LED sim on, focus `#led-layout`, press `g`; blur, Ctrl+G; preview on, `p` as three auto-repeat key downs; Escape and one `p` (pilot on from either state), click `#view-front`, screenshot | `gizmo_0{1..4}_*` (gizmo state, focused element, `#led-layout` value), `pilot_view_front` |
| `p2_project_v2` | 1. preview on, custom filmback 30×20, focal 50, pose (2, 1.2, 4) / (5, −10, 2), safe distance on. 2. person at (1, 3), rot 45, scale 1.5; car on. 3. Add Section (so that section 1 exists), LED sim on then panel IDs on, border 12, font colour `#ff0000`, the 16×8 test PNG on section 0, a generated 2,000,000-byte 24-bit noise BMP on section 1, wireframe on. 4. `v2_first__export-json`. 5–6. fresh page, import it, record, screenshot, `v2_second__export-json`. 7. preview off (only if on), `v2_off__export-json`, fresh page, import it, preview on (only if off), record. 8. import an inline one-section v2 file whose `assets[]` hold an `https://` URL, a `data:text/html` URI, a data URI with a base64 length that is not a multiple of 4, and an SVG with `<script>`, `<foreignObject>` and an external `href` (the section's logo); `combined__export-panel-ids`, `combined__export-zip`; the stored SVG text, read from that archive | `camera_*`, `ui_*`, `toggle_aria_*` (the `toggle_aria` probe of 08 sections 6.18 and 8.3: every `.toggle`, `.active`, `role`, `aria-checked`, `tabindex`), `logos_*` (the list with every `data-*` attribute), `dialogs_page{1,2,3...}` (dialogs per page), the three JSON exports, the screenshot, `stored_svg_08_hostile` (every `.svg` entry and every base64 `data:image/svg+xml` URI of the archive's JSON, decoded: the DOM never shows a logo's bytes), `network.json` |
| `p2_true_framing` | 1. Import the 18° half circle (one section, 10 × 3 panels of 500 mm, curve 18°); preview on (Reset); safe distance on; screenshot `arc18`; Pan 90. 2. Fresh page: import one flat 5 × 3 section with a 90° section offset (the wall along +Z); preview on; safe distance on; screenshot `offset90`. 3. Fresh page (default wall): preview on; Pan 180, then Z −3 (the back of the wall) | `arc18_reset`, `arc18_pan_90`, `offset90_reset`, `behind_wall` (`cameraState()` plus `wallDistance`, the `#camera-wall-distance` text), 2 screenshots |

**`p2_project_v2` and the request log.** The scenario sets `recordRequests: true`. `lib/app.mjs`
then keeps the URL of every `Network.requestWillBeSent` from the scenario's first step on, except
while a page (re)load is in progress (`AppPage.open`, `AppPage.reload`), and `network.json` lists the
`http(s)` URLs whose origin is not the app's own (data and blob URLs are not requests to anyone),
each (step, URL) pair once. Every web-font face is preloaded before the first step and inside each
reload, so a font download never enters the log. No other scenario writes `network.json`.

**Generated payloads.** The noise BMP is 788 × 846 px, rows of 2,364 bytes without padding, the pixel
array at offset 56 (a 14-byte file header, a 40-byte `BITMAPINFOHEADER` and 2 bytes of gap), so the
file is exactly 2,000,000 bytes; the noise comes from a seeded PRNG, so it is the same on every run,
and it does not compress, so its PNG conversion exceeds 2 MB.

**Why 70,000 px in `p2_oversize_canvas`.** The harness browser (Chrome 154, measured) draws canvases
up to 65,535 px per side and 268,435,456 px in area, so a 50,000 px wall still exports correctly in
it. The wall is made wider than 65,535 px so that the unfixed Export Panel IDs (`TypeError` in
`URL.createObjectURL`), the ZIP texture (0 bytes) and the viewport texture fail in the harness too.
08 P2-1's guard uses the stricter 32,767 px limit of other browsers.

## The feature scenarios (03 pivot)

[`scenarios-features.mjs`](scenarios-features.mjs) adds the five scenarios of
`docs/improvements/03-pivot.md` section 8.3 (03 T8, step E of its 8.4). They are **forward goldens**, captured from the
feature build after its acceptance criteria were checked, and registered after the Phase 2 scenarios. They follow the
same DOM-only rules. The pivot is session-only until project file v2 (the owner's decision of 2026-10-17), so
`pivot_roundtrip` and `pivot_validation` record that behaviour; the v2 round trip and validator rows of 03 8.3 come
with 03 T7.

| Scenario | Steps | Records |
|---|---|---|
| `pivot_modes` | For the default wall and the imported `concave_offsets`, `mixed`, `box_corner`: each pivot mode (radio card click), then Offset (0.5, 1, 2) in wall-center; per state the panel, `<state>_combined__export-obj` (ZIP), `<state>_section__export-gltf`, a screenshot; `mixed` also in every mesh mode for mesh-center and wall-center; then the mesh-mode cards and `final__export-json` | `<wall>_<state>_pivot`, the exports, screenshots, `<wall>_offset_postcheck` (every OBJ `v` moves by -delta within 1e-6 and every glTF POSITION within 2^-22 * max(1, abs(old), abs(delta)): 03 AC 7), `mesh_modes` |
| `pivot_stage` | Preview on, Z Position 1.5, person and car on; bottom-left, wall-center, mesh-center with keep stage layout on; the same on a fresh page with it off; then wall-center, Add Section, Offset Z 2, Z Position 0 and -5 | per step the camera and prop inputs, the coverage read-outs, Distance to wall plane, the pivot status and readout, the `#camera-pos-z` `min`, screenshots (03 AC 5, 6, 13, 19) |
| `pivot_gizmo` | Offset Z 2, top view, `o`; the X arrow (its tip: the right-most gizmo-red pixel, as in `gizmo_drag`) dragged 120 px, OBJ export; Offset Y 0.123 and a Ctrl drag; park, `cancel_before`, a drag with Escape and two more moves before the release, park, `cancel_after`; Escape; `o` then `r`; the checked radio focused, ArrowDown | the gizmo badge and buttons with the panel per step, `*_handle` (`found` or `skipped`), `cancel_postcheck` (`cancel_after` against `cancel_before` with the harness screenshot rule: IDENTICAL or WARN passes, FAIL means an orbit jump or a leftover hover), `focus_*` (03 AC 9-11, 18) |
| `pivot_roundtrip` | An identity OBJ and glTF; wall-center + (0, 0, 2) with its exports and Export JSON; re-import that JSON; export again | the panel before and after the import, the exports, `rt_postcheck` (no `pivot` key in the v1 JSON, both JSON exports identical, the exports after the import equal the identity ones) |
| `pivot_validation` | mesh-center, Offset Y 3, keep off; import a v1 `concave_offsets` carrying a hand-written invalid `pivot` block; then Offset X `abc`, empty, `2000`, `0.0004`, `0` | the panel after the import (bottom-left, 0, keep on: the block is not applied), its dialogs, the typed values (03 AC 8) |

## The platform scenarios (07 R1/R2)

[`scenarios-platform.mjs`](scenarios-platform.mjs) adds two scenarios for the camera preview of
`docs/improvements/07-platform-foundations.md` (R1 render layers, R2 the preview drawn by the main renderer). They were
captured by the harness-only commit B2-0 on the two-canvas build, so their baselines document it; 07 R2 changes them with
its own manifest. Same DOM-only rules; `#camera-preview-canvas` is read only through its client rect, because from 07 R2
on it is a layout placeholder with no WebGL context (the main canvas draws the preview at its place, 07 3.6).

| Scenario | Steps | Records |
|---|---|---|
| `preview_compositing` | Preview on; the resize handle dragged 280 px left (600 × 400 at Full Frame); two orbit drags from a free canvas point left of centre (+120 px, then -180 px), each followed by a full-page screenshot | `00_preview_on`, `01_enlarged`, `0{2,3}_orbit` (the WebGL canvases of `window.__glCanvases()`, the rects of `#three-canvas`, the window and `#camera-preview-canvas`, the window's inline size, corner radius and background, the canvas attributes, the three labels; for the orbits also `mirror` and `staleSuspected`), `0{2,3}_orbit.page.screenshot.png` |
| `preview_clean` | Person on, `g`, the person picked with the preview off; preview on, Safe Distance on; Full Frame; RED V-RAPTOR; Custom 100 × 10 mm and the handle dragged 600 px left | `person_pick`; per filmback `<label>.json` (the same preview state plus `gizmoInPreview`, the gizmo-coloured pixels inside the preview rectangle outside the window bars and the viewport overlays, and the gizmo panel), `<label>.canvas` and `<label>.window` screenshots |

The owner's report (2026-10-17): after enlarging the preview window and orbiting, a rectangle of the main viewport with
the preview's size, mirrored vertically (top right instead of bottom right), stopped updating. It is a browser
compositing bug of two overlapping WebGL canvases (the original app has it too). `mirror` counts the pure-black pixels
(max channel <= 4; the scene background is 0x0a0a0a) of that mirrored rectangle outside every overlay. **Neither headless
SwiftShader (the harness) nor a one-off headless run on the GPU (ANGLE D3D11, Intel UHD) reproduces it**: `blackFraction`
is 0 on the two-canvas build, so the scenario guards the structural fix instead: `glCanvases` must list exactly one
canvas (`three-canvas`) after 07 R2 (07 AC 1).

`window.__glCanvases()` comes from `lib/inject.mjs`: a hook on `HTMLCanvasElement.prototype.getContext` that remembers each
canvas that received a `webgl`, `webgl2` or `experimental-webgl` context (`{id, type, connected}`, in creation order).
It never changes the returned context, so every other output is unchanged.

## Output layout

```
<out>/manifest.json                      { meta, scenarios: { name: { description, durationMs, outputs } } }
<out>/<scenario>/<step>__<filename>      every downloaded file, byte-for-byte (file names from Brand.files, see below)
<out>/<scenario>/<name>.json             recorded DOM state (stats, snapshots, camera texts, class lists ...)
<out>/<scenario>/<name>.screenshot.png   viewport screenshot clipped to #three-canvas
<out>/ui_visual/NN_<state>.styles.json   computed styles + rects of the probed UI elements
<out>/ui_visual/NN_<state>.text.json     UI text content
<out>/ui_visual/NN_<state>.viewport.screenshot.png / .sidebar.screenshot.png   canvas-masked UI screenshots
<out>/<scenario>/*.zip.entries/...       extracted ZIP entries, for inspection
<out>/<scenario>/downloads.json          which files each export step produced (an empty list is recorded too)
<out>/<scenario>/dialogs.json            alert/confirm/prompt messages
<out>/<scenario>/console.json            exceptions, console.error calls, failed network requests, harness errors
<out>/p2_project_v2/network.json         the opt-in request log (only scenarios with recordRequests: true)
```

The download file names are the app's `Brand.files`, all derived from `Brand.filePrefix = 'morph-led-wall'` since
Feature 6 T6b: `morph-led-wall.json`, `.obj`, `.mtl`, `.gltf`, `morph-led-wall-export.zip`,
`morph-led-wall-panel-ids.png` and `morph-led-wall-safe-distance.obj`, and since 08 P2-6e `morph-led-wall-obj.zip`
(Export OBJ's one download; its entries are the `.obj`, the `.mtl` and `textures/`) (before: `led-wall-config.*`,
`led-wall-export.zip`, `panel-ids.png`, `safe-distance-floor.obj`). The ZIP's section textures keep their
`textures/<section>_PanelIDs.png` names (user data). Manifest patterns stay filename-agnostic
(`**/*__export-obj__*.zip`), so they survive the rename.

Each output entry in the manifest is `{ file, sha256, kind, bytes, ... }`, where `kind` is one of
`obj | mtl | gltf | json | png | zip | state | screenshot | console`. ZIP outputs also list
`entries: [{ name, sha256, size }]`.

## How outputs are compared

Byte-identical files report `IDENTICAL`. Otherwise:

- **OBJ, MTL and text:** compared line by line and token by token. Numeric tokens use an absolute
  tolerance. Everything else, including `f a/b/c` index tokens, must match exactly.
- **glTF:** the JSON structure is deep-compared with tolerance, with embedded buffer URIs
  excluded. Every accessor is then decoded from the base64 data URIs and compared element by
  element: float32 with tolerance, integer types exactly.
- **JSON and state files:** deep-compared. Numbers use the tolerance, strings must match
  exactly, and object key order is ignored. The `ui_visual` style and text snapshots are state
  files. Every computed value is a string and every rect is rounded to 0.5 px, so in practice they
  must match exactly. `--ignore-keys` removes the named keys from both sides first (a cross-check only). A failing style snapshot is reported per element, style changes before rect
  changes, for example
  `2 element(s) differ: toggle-label [width: ...; font-size: "13px" vs "13.5px"; ...] || card0/chevron [transition-duration: "0.2s" vs "0.25s"]`.
- **Exported PNGs:** decoded by a built-in PNG decoder. The report gives the maximum channel
  difference and the % of pixels that differ. The result is a FAIL beyond the thresholds and a
  WARN for smaller differences.
- **Screenshots:** compared the same way, with looser defaults. More than 0.5% of pixels differing
  by more than 8 levels is a FAIL. Any smaller difference is a WARN. The `ui_visual` page and
  sidebar screenshots use the same rule. A small UI change, such as a reworded label, can therefore
  show up only as a screenshot WARN. The exact style and text snapshots of the same state are the
  check that fails it.
- **ZIP:** archives are compared by entry list and by each entry's content, using the rules above.
- **`--rename`** (Feature 6 T6b) maps the baseline's download file names first (output keys, ZIP entry names and
  the file-name tokens inside text outputs), so a pure rename compares identical.
- **Console:** compared as a multiset of `(kind, normalised message)`. URLs, ports, line and column
  numbers, and stack traces are stripped. New errors are a FAIL. Errors that disappear are a WARN,
  because that usually means a fix.
- **Missing or extra outputs, and missing or extra scenarios:** always a FAIL.

### Known nondeterminism and how it is handled

- **ZIP container bytes** differ on every export, because JSZip stamps entries with the current
  time. Archives are compared by entry list and content.
- **Overlay glyphs over a WebGL canvas.** Screenshots can differ by 1 level in 1–8 pixels between
  runs, and every such pixel lies on a glyph of DOM text composited over a WebGL canvas: the help
  badge over the main canvas, the pilot-mode banner, and the camera preview window's header
  ("Camera View", lens) and footer (FOV, resolution) labels. The pixels are bistable: the same
  pixels flip between the same two values, in both directions. This was first seen in the
  `keyboard` scenario (`pilot_view`, `final_view`) and between captures of the original
  (`preview_resize`, `pilot_look`, `preview_off_in_pilot`). With the ES-module build it shows up
  more often (`camera`, `gizmo_drag`, `import_edge` `i_empty`, `toggles` `15_car_moved`,
  `p2_curved_safe_distance` `concave_offsets`, ...),
  because the page can paint before the app starts, while the original's inline script ran before
  the first paint. It occurs equally with the verbatim legacy script loaded as a module (integration
  step I-1). A same-browser A/B run of the original and the candidate showed identical overlay-free
  canvas pixels and an identical draw list (object, material and geometry ids, and draw order).
  It stays far below the FAIL threshold and is always a WARN. A WARN anywhere else, or above 1
  level, is a real difference. Since P2-0 this list is data:
  [`expected/_nondeterminism.json`](expected/_nondeterminism.json) holds one entry per output (or
  output pattern) with its bounds (at most 1 level, at most 8 pixels), the overlay element and the
  evidence, and every `compare.mjs --expect` run reports a difference within those bounds as
  `JITTER`. The entries are exactly the outputs named above (the "..." resolved by P2-0's two full
  self-consistency runs; see [Phase 2 re-baselining](#phase-2-re-baselining)), plus the outputs
  added since, each by its own allowlist commit with its evidence:
  `p2_curved_safe_distance/concave_offsets` (1 level, 4 px on the help badge and the preview
  footer's resolution label, between the baseline promoted by P2-0 and a full run of the same build);
  `p2_curved_safe_distance/convex` (1 level, 2 px on the help badge and the preview footer, between the
  two runs of the 06 T4a build), `toggles/14_car_default` (1 level, 7 px on the help badge, between two
  runs of the 06 T4b build) and `p2_curved_safe_distance/concave30` (1 level, 1 px on the help badge,
  between the two runs of the 06 T4a2 build). The rect-limited entries of 06 T4b's manifest (a watermark rectangle on
  every canvas capture) judge every pixel outside their rectangles, so they tolerate only this list
  within its bounds: jitter on any other output, or above the bounds (one run of the 06 T4b build showed
  9 px on `toggles/15_car_moved`), fails them, and the gate run is repeated.
- **Export PNG pixels in `large_wall`'s ZIP.** The 3840 × 1920 section textures of
  `large_wall/final__export-zip__morph-led-wall-export.zip` (`led-wall-export.zip` before 06 T6b) show single bistable pixels that flip by
  1 level between runs of the same build: `textures/L2_PanelIDs.png` (1995, 948),
  `L3_PanelIDs.png` (1970, 1003) and `L4_PanelIDs.png` (2026, 858), first seen in the P2-0b gate and
  in almost every run since. The allowlist covers screenshots only, so compare reports them as a WARN
  on the ZIP. Until `compare.mjs` extends `JITTER` to PNG entries of exports, every manifest lists
  that ZIP under `mayChange` with this reason, and the reviewer checks in the compare report that
  only those PNG entries differ (the ZIP's JSON, OBJ, MTL and glTF entries must stay identical).
- **CSS transitions** (0.2–0.3 s) are waited out through `document.getAnimations()` before any
  state read or screenshot.
- **Fonts** are preloaded with `document.fonts.load()` before the app is used, so panel-ID canvas
  text never races the web-font download. `ui_visual` also preloads every weight the page requests.
- **WebGL in UI screenshots:** `ui_visual` hides both canvases while it captures, so its screenshots
  contain no 3D rendering. They were byte-identical across self-consistency runs.
- **Gizmo handle positions** in `gizmo_drag` come from a canvas screenshot, so they are as
  deterministic as the rendering. The drag results are recorded as the app's own `toFixed` strings
  and the found/skipped flags, never as pixel coordinates.
- **Asynchronous imports** (`FileReader`) are awaited by watching `#wall-sections` for changes and
  `alert` calls. An import that changes nothing (`{"foo": 1}`) waits the full 2 s, so its recorded
  result is deterministic too.
- **The standing allowance** is `expected/_nondeterminism.json` and nothing else (it replaced the
  empty `WARN_ONLY` list that `compare.mjs` had in Phase 1). Adding an entry is a separate commit
  that changes no code (see [Phase 2 re-baselining](#phase-2-re-baselining)).

## Phase 2 re-baselining

`docs/improvements/08-bugfix-roadmap.md` section 8.1 is the one procedure for every commit that
changes a golden output, in any spec (Phase 2 fixes, Features 1-6, the platform work):

- **The baseline of a commit is the harness output of its parent commit.**
- **Each intentional change is declared up front** in `tests/regression/expected/<commit-id>.json`.
- **Every gate run is full.** `run.mjs --only` is for local iteration and never produces a promoted
  baseline.

```bash
# 0. Baseline = the parent commit (skip if the previous commit promoted tests/regression/output/baseline).
git worktree add ../led-baseline HEAD
node tests/regression/run.mjs --root ../led-baseline --out tests/regression/output/baseline
git worktree remove ../led-baseline

# 1. Implement ONE commit. Write tests/regression/expected/<commit-id>.json first.
GOLDEN_DIR=./no-golden node --test "tests/unit/**/*.test.mjs"   # golden-file tests skip
node tests/static/check.mjs && node tests/static/css-slices.mjs

# 2. Full candidate run.
node tests/regression/run.mjs --root . --out tests/regression/output/candidate

# 3. Gate: every diff declared, every declared change happened (also loads expected/_nondeterminism.json).
node tests/regression/compare.mjs tests/regression/output/baseline tests/regression/output/candidate \
     --expect tests/regression/expected/<commit-id>.json --verbose
#    Export commits also run the structural checks on the candidate outputs (check-orientation walks the directory,
#    ZIP entries included, since 01 T1):
node tools/check-orientation.mjs --failures-only tests/regression/output/candidate
node tools/check-gltf.mjs tests/regression/output/candidate/*/*.gltf

# 4. Review every EXPECTED diff (PNGs side by side, OBJ/glTF text, dialogs, console).
# 5. Promote the reviewed candidate.
rm -rf tests/regression/output/baseline && mv tests/regression/output/candidate tests/regression/output/baseline
# 6. Self-consistency and golden unit tests against the promoted baseline.
node tests/regression/run.mjs --root . --out tests/regression/output/candidate
node tests/regression/compare.mjs tests/regression/output/baseline tests/regression/output/candidate   # must exit 0
node --test "tests/unit/**/*.test.mjs"
# 7. Commit code + expected/<commit-id>.json + the ARCHITECTURE section 8 amendment.
#    Message: "fix(B-xx): <what>; re-baselined: <manifest id>"
```

To classify step 6's remaining differences, run the same comparison with `--expect` and a scratch
manifest whose `expect` list is empty (`{"commit": "self", "expect": []}`, not committed): it must
exit 0 with every remaining difference reported as `JITTER`.

**Manifest format** (committed):

```json
{
  "commit": "P2-1a",
  "bugs": ["B-H3"],
  "expect": [
    { "output": "large_wall/panel__export-gltf__*.gltf", "change": "added" },
    { "output": "large_wall/{downloads,console}.json", "change": "modified", "each": true }
  ],
  "mayChange": [
    { "output": "toggles/01_wireframe.screenshot.png", "reason": "wireframe draw order may change" }
  ]
}
```

- `output` is a pattern over `<scenario>/<output>`: `*` matches within one path segment, `**` across
  segments, `{a,b}` is alternation (nestable), `?` is one character. Prefer segment-agnostic,
  filename-agnostic patterns for whole output kinds (`**/*__export-obj__*.zip`,
  `**/*combined__export-*`); use explicit names only for single outputs, checked against the
  parent's baseline listing. Write manifests by grepping the parent's baseline, never from memory
  (08 section 8.2, R10).
- `change` is `added` (only in the candidate), `removed` (only in the baseline) or `modified`.
- `mayChange` entries take an optional `change` and a `reason`; plain pattern strings are accepted.
- `exclude` (optional, any entry) is a pattern of outputs the entry does not match, for example
  `"output": "*/*.screenshot.png", "exclude": "ui_visual/**"`.
- `rects`, `size` and `measure` are the rect allowances of the next section.
- Other keys are refused (exit code 2), so a typo cannot silently disable an entry.

**`compare.mjs --expect a.json[,b.json]` semantics:**

1. A differing output (status FAIL or WARN, including a missing or extra output) that matches an
   `expect` entry with a compatible `change` is reported as `EXPECTED` and does not count.
2. One that matches `mayChange` is reported as `EXPECTED?` and does not count.
3. Any other difference keeps its normal status.
4. **An `expect` entry is satisfied only by a differing output.** A within-tolerance PASS (for
   example a re-encoded but pixel-identical screenshot, or a 1e-7 numeric change) does not satisfy
   it. Without `each`, one differing match suffices; with `"each": true`, every matching output
   present in the baseline must differ. An unsatisfied entry is a FAIL ("expected change did not
   occur"), and so is an entry whose pattern matches nothing.
5. Consequently a change that may stay under the screenshot tolerance is declared under
   `mayChange`, never under `expect`.
6. `expected/_nondeterminism.json` is applied first (`JITTER`, below).
7. The exit code is 0 iff there is no FAIL. A scenario present in only one tree reports each of its
   outputs as added or removed (the P2-0 manifest declares `p2_*/**` as added).

The report lists every `EXPECTED`, `EXPECTED?` and `JITTER` output with its detail, then one line per
`expect` entry (`ok` with the number of differing and matching outputs, or `FAIL` with the reason),
then the summary.

**The nondeterminism allowlist** (`expected/_nondeterminism.json`, committed) is the README's
"Known nondeterminism" list as data:

```json
{ "jitter": [ { "output": "keyboard/{pilot_view,final_view}.screenshot.png", "maxLevel": 1, "maxPixels": 8,
                "overlay": "pilot banner, help badge", "evidence": "..." } ] }
```

- A screenshot difference on a listed output with a maximum channel difference `<= maxLevel` and at
  most `maxPixels` differing pixels is reported as `JITTER`: it does not count, and it never
  satisfies an `expect` entry. A larger difference keeps its normal status.
- It is loaded by every `--expect` run and never listed by hand; it is the only standing allowance.
- Any other undeclared screenshot WARN is reviewed, and declared under `mayChange` with a reason if
  it is accepted. Nobody adds jitter entries to a commit manifest.
- **Adding an entry** is a separate commit that changes no code: it attaches the self-consistency
  evidence (two runs of the same build, the output name, the maximum level and pixel count, the
  overlay element) and updates this README in the same commit. P2-0 created the file from this
  README's list plus every screenshot that differed between its own two full self-consistency runs.

**Structural checkers** (Node, no dependencies; see their file headers):

- `node tools/check-orientation.mjs [--failures-only] <file.obj|file.gltf|file.zip|directory ...>`: for
  every triangle, the geometric normal of its counter-clockwise winding has a positive dot product with
  the vertex normal at each of its three vertices; one PASS/FAIL line per object (`--failures-only`:
  only the FAIL lines and the summary), exit 1 on any failure. A face without vertex normals fails.
  Since 01 T1 a directory is walked recursively for `*.obj`, `*.gltf` and `*.zip`, and each archive's
  `.obj` and `.gltf` entries are checked (reported as `<archive>!<entry>`), so
  `node tools/check-orientation.mjs --failures-only tests/regression/output/baseline` checks every
  export of a capture. Since 08 P2-2 every wall export passes, and since 08 P2-5b every export: the
  safe-distance floor OBJs (no `vn`, B-L29), the last row of `OPEN_DEFECTS` in
  `tests/unit/export-orientation.test.mjs`, now carry `vn` lines and +Y faces. `p2_zero_inputs`' combined OBJ passes
  since 08 P2-8a (Columns 2.5 is rounded to 3) and `import_edge`'s `ii_combined` and `ii_section` OBJ and glTF since
  08 P2-3b (the string counts are coerced).
  That test runs the same check over `GOLDEN_DIR` and over 500 seeded integer walls in every mesh mode.
- `node tools/check-gltf.mjs <file.gltf ...>`: buffer, bufferView and accessor bounds, component and
  4-byte alignment, index values below the vertex count and never the primitive-restart value,
  `POSITION` min/max compared after `Math.fround`, unit `NORMAL`s, the `TEXCOORD_0` count, and the
  mesh, material, node and scene references; exit 1 on any failure. Today the string-number glTFs of
  `import_edge` (`ii_combined`, `ii_section`) failed it (indices beyond the vertex count, B-L8) until
  08 P2-3b, which coerces the string counts on import.

Their unit tests are `tests/unit/tools.test.mjs`; the `--expect` semantics are unit-tested in
`tests/unit/compare.test.mjs` on synthetic output trees.

### Rect allowances, `--diff-bbox` and the palette hook (01 T2)

The second step of the harness-only series (08 P2-0, then this, then 07 G3; 07 C57). A step whose
screenshots may change only inside known screen regions (01 F1-2's toolbar column and help badge, 06 T4b,
07 I4a's badge rewrite) declares those regions on its `--expect` entries instead of accepting whole
screenshots:

```jsonc
{ "output": "*/*.screenshot.png", "exclude": "ui_visual/**", "change": "modified",
  "measure": { "frame": "canvas", "window": [1600, 1000], "selectors": [".viewport-controls", ".viewport-info"], "pad": 8 },
  "size": [1200, 940],                                                   // written by measure-rects.mjs
  "rects": [{ "x": 1132, "y": 12, "w": 56, "h": 248, "label": ".viewport-controls" }, ...] }
```

- **The per-pixel rule.** A differing screenshot (or exported PNG) matched by an entry with `rects` is
  `EXPECTED` (or `EXPECTED?` for a `mayChange` entry) only when **every** pixel with any channel
  difference lies inside the union of the rectangles; one pixel outside makes it a **FAIL**, even when the
  difference alone would only be a WARN. A bounding-box test would not do: the column and the badge sit in
  opposite corners. The one exception is the standing jitter (F1-0c): on a screenshot listed in
  `expected/_nondeterminism.json`, pixels outside the rectangles are tolerated when they stay within that
  entry's bounds (largest channel difference <= `maxLevel`, at most `maxPixels` of them), exactly what the
  allowlist accepts on an otherwise unchanged capture; the detail reports them as "outside within the
  allowlisted jitter". Without it, a step that changes the help badge of `camera/08_camera_moved` would fail
  whenever that capture's preview-header glyphs flip.
- **The frame-size check.** The image must have exactly the entry's `size`; a differing capture of
  another size (a camera-preview capture, the narrow page) is a FAIL `rect frame mismatch`. Unchanged
  captures pass whatever their size. `rects` and `size` always go together, and only with
  `"change": "modified"`; a rect entry that matches a differing non-image output makes it a FAIL.
- **Rectangles are measured, never typed.** `node tests/regression/measure-rects.mjs --root . --manifest
  tests/regression/expected/<commit-id>.json` opens the candidate page with the harness lib at each
  `measure.window` size, takes the `getBoundingClientRect` of each selector that is present and visible,
  pads it by `measure.pad` (default 8 px), rounds outwards, clips it to the frame, and writes `rects` and
  `size` into every entry that has a `measure` object: `frame: "canvas"` gives rectangles relative to
  `#three-canvas` and its size (the `screenshotCanvas` captures), `frame: "page"` the page frame at the
  window size (`ui_visual`'s page captures). `--dry-run` prints without writing. compare refuses an
  entry with `measure` but no `rects` (not measured yet). Like the harness, it runs one Chrome at a time.
- **`--diff-bbox`** adds, to every differing image output, the bounding box of its differing pixels and,
  for an output judged by a rect entry, the box of the pixels outside the rectangles. The reviewer copies
  it into the compare report.
- **The palette hook** (`lib/palette.mjs`, 07 C53): `livePalette(app)` returns the colours a pixel probe
  looks for, read from the running page, never from literals: the section colours from the cards' colour
  inputs (`wall` is section 0), and each scene colour (`background`, `cabinet`, `faceFront`,
  `faceBack`, `vertexNormal`, `faceNormal`, `frame`, `gridCenter`, `gridLine`) from its `--scene-*`
  token on `:root` when spec 06 defines it, else from the served build's `js/theme/Theme.js`
  `SceneTheme` (imported inside the page, only when it loads `js/main.js` as a module), else `null`.
  `normals_debug` reads it through `lib/probe.mjs readProbePalette` (01 T8).

None of this changes a capture: the rect fields only change how `compare.mjs --expect` judges a
difference, and `measure-rects.mjs` and the hook are not run by `run.mjs`. Their unit tests are the rect
section of `tests/unit/compare.test.mjs` (synthetic PNG pairs) and `tests/unit/harness-lib.test.mjs`.

## Contract the refactor must keep

The harness depends on this markup:

- **Ids:**
  - Stats: `total-pixels`, `total-panels`, `total-sections`, `total-arc`
  - Sections and canvas: `wall-sections`, `add-section-btn`, `three-canvas`, `mesh-mode-select`
  - Display and panel-ID toggles: `toggle-wireframe`, `toggle-frame`, `toggle-led-sim`, `led-layout`, `toggle-panel-ids`
  - Panel-ID styling: `panel-border-thickness`, `panel-font-size`, `panel-font-color`, `toggle-section-labels`, `section-label-size`, `section-label-color`
  - Camera preview: `toggle-camera-preview`, `camera-filmback`, `filmback-width`, `filmback-height`, `camera-focal-length`
  - Camera transform: `camera-pos-x/y/z`, `camera-rot-x/y/z`, `reset-camera`
  - Camera readouts: `camera-hfov`, `camera-vfov`, `camera-aspect`, `frustum-width`, `frustum-height`, `frustum-status-text`, `safe-distance`, `camera-preview-info`, `camera-preview-fov`, `camera-preview-res`
  - Camera panels and safe distance: `camera-preview-options`, `camera-preview-window`, `custom-filmback`, `toggle-safe-distance`, `export-safe-distance`
  - Props: `toggle-person`, `person-pos-x/z`, `person-rot-y`, `person-scale`, `toggle-car`, `car-pos-x/z`, `car-rot-y`, `car-scale`, plus `person-options` and `car-options`
  - Option panels: `led-sim-options`, `panel-id-options`
  - Views: `view-front`, `view-side`, `view-top`, `view-reset`, `toggle-grid`
  - Gizmo and selection: `gizmo-translate`, `gizmo-rotate`, `gizmo-space`, `gizmo-pilot`, `selection-indicator`, `pilot-info`
  - Exports and import: `export-zip`, `export-panel-ids`, `export-json`, `export-obj`, `export-gltf`, `import-input`
  - Wall pivot (03 T6; the pivot scenarios of 03 8.3): `pivot-mode-select` (with `input[name="pivot-mode"][value=bottom-left|mesh-center|wall-center]`
    radios inside `.pivot-mode-option[data-pivot-mode]` labels, never `.mesh-mode-option`), `pivot-offset-x/y/z`,
    `pivot-reset-offset`, `pivot-select`, `pivot-snap`, `toggle-pivot-keep-stage`, `toggle-pivot-marker`, `pivot-readout`,
    `pivot-status`, and the camera row `camera-wall-distance`
- **Mesh mode:** `#mesh-mode-select input[name="mesh-mode"][value=combined|section|panel]`. The
  harness clicks the enclosing `<label>` and records `.active` on that label.
- **Section cards:** the direct children of `#wall-sections`. Inside a card it uses
  `input[data-field=panelCols|panelRows|panelWidth|panelHeight|ledX|ledY|curveIntensity|angleOffset]`,
  `.section-name-input`, `input[type=color]`, `[data-color]` swatches (with `.active`; since 06 T7 the swatch click of
  `ui_sections` is by index, `.color-swatch-small:nth-child(4)`, so it does not depend on the palette),
  `.section-header`, `.section-delete[data-id]` and the `.collapsed` class.
- **State classes:** `.active` on toggles and gizmo buttons, `.visible` on
  `#selection-indicator` and `#pilot-info`, `.world` and `.local` on `#gizmo-space`, and
  `.selected-name` text inside the indicator.
- **Downloads:** captured from `<a download>` elements, whether clicked with `.click()` or a
  dispatched click event, with blob or data URLs. Downloads made any other way, such as
  `showSaveFilePicker`, would show up as missing outputs.
- **`ui_visual`:**
  - It uses every selector in [`ui-spec.mjs`](ui-spec.mjs), for example `.header`, `.brand-lockup`,
    `.product-name`, `.stat-value`, `.control-panel`, `.global-section`, `.toggle`, `.mesh-mode-option`,
    `.input-field`, `.export-btn.secondary`, `.camera-info`, `.frustum-status`, `.view-btn`,
    `.gizmo-mode-btn`, `.gizmo-divider`, `.subsection-title`, the
    `.section-logo-*` classes, and the card classes `.section-header`, `.section-title`,
    `.section-summary`, `.section-toggle`, `.section-content`, `.section-row(.single)`,
    `.curve-hint`, `.section-color-picker`, `.color-swatch-small`, `.color-input-custom` and
    `.section-warning`.
  - It also uses a few positional selectors where the markup has no class or id:
    - `#camera-preview-window > div` [1] and [2] for the top and bottom bars, and
      `#camera-preview-window span`
    - `.camera-info > div` and `.frustum-status > div` for the rows
    - `.global-section` [0] and [1]
    - `#section-logos-container > div` and its first child div
  - The section-logo upload uses `#section-logos-container input[type="file"]`, and waits for
    `.section-logo-upload-btn.has-logo`.
  - `.control-panel` must remain the sidebar's scroll container.

  If one of these selectors stops matching, the probe records `found: false`, and the comparison
  fails until the baseline is deliberately re-captured.
- **The extra scenarios** additionally use:
  - the logo rows: the children of `#section-logos-container`, with `.section-logo-upload-btn`
    (`data-section-id`, `.has-logo`), `input[type="file"]`, `.section-logo-clear` (`.visible`),
    `.section-logo-position` with `select[data-field="position"]`, and `.section-logo-scale` with
    `input[data-field="scale"]`;
  - `.section-title` inside the cards, `.mesh-mode-option[data-mode]` labels and
    `input[name="mesh-mode"]` radios;
  - `#camera-preview-resize` (drag handle), the inline `style.width` / `style.height` of
    `#camera-preview-window`, and the `width` / `height` attributes of `#camera-preview-canvas` (none from 07 R2 on:
    the canvas is a layout placeholder whose client rect is the preview rectangle; `normals_debug` and
    `preview_clean` capture that rect from the page, so they read the main canvas's scissor pass there);
  - the children of `.viewport-overlay`, and `#camera-preview-window` itself, as the overlay rects
    that pixel searches skip;
  - the scene colours that pixel searches look for: the person (0x4488ff @ 0.85), the camera body
    (0xc51622, opaque, with a 0x0a0a0a edge outline since 06 T5; 0xff6600 @ 0.8 before) and the gizmo's red
    and green handles (0xff4444 / 0x44ff44 @ 0.35). The matchers of `scenarios-extra.mjs` are derived from
    those blends over the 0x0a0a0a background (06 8.3): isGizmoRed asks g >= 24, so the anti-aliased edges of
    the red body (g <= 22) never pass for a gizmo handle. Since 06 T7 the person predicate (`isPersonPixel` of
    `scenarios.mjs`, one copy for every person pick) also accepts the person over the Studio Grey default wall
    ((90, 148, 249), its second branch); with `REGRESSION_DEBUG_DIR` set, every person pick and every `locate` keeps its
    screenshot and hit there (`debugDump`), so a pick can be checked to lie on the body.

## Baseline facts worth knowing

These were observed in the original app and are part of the golden master until the Phase 2 fix named
in parentheses changes them:

- `camera`: Export Safe Distance OBJ throws `ReferenceError: downloadBlob is not defined`, so no file is
  produced (08 P2-5a: the OBJ downloads; 08 P2-5b: a shared-vertex strip facing +Y with `vn` lines, no `# Clamped:`
  line on this flat wall). `14_preview_off` still shows
  the safe-distance floor after the preview is turned off (B-M8) (08 P2-4b: the floor is removed with the preview;
  `cam_15` shows it again).
- `large_wall`: Export glTF in panel mode throws `RangeError: Maximum call stack size exceeded`
  from `btoa(String.fromCharCode(...buffer))`, so no file is produced (08 P2-1a: the chunked encoder
  writes the file).
- `import_edge`: after importing an empty wall, Add Section throws
  `TypeError: Cannot read properties of undefined (reading 'panelCols')`, and Export OBJ and Export
  glTF throw `TypeError: Cannot read properties of undefined (reading 'color')` (08 P2-1a: both are
  M-EXP-1 alerts, `Export OBJ failed: ... No file was downloaded.`; Add Section still throws). Importing `null`
  alerts `Error parsing JSON file: Cannot read properties of null (reading 'sections')`, and the
  malformed file alerts `Error parsing JSON file: Unexpected end of JSON input` (08 P2-3b, B-L8: the empty file is
  refused with M-IMP-2 and the default wall stays, so Add Section works and every export downloads; (ii) string
  numbers, (iii) the unknown mode, (iv) the duplicate ids and (v) the string id are corrected with one M-IMP-5 alert
  each; `{foo: 1}` alerts M-IMP-1 and `null` M-IMP-4a; the malformed file keeps its text).
- `preview_off_in_pilot`: three alerts `Enable Camera Frustum Preview first to use Pilot Mode`, and
  pilot mode stays on until the preview is enabled again (B-H4) (08 P2-4a: one alert, the entry attempt with the
  preview off; turning the preview off leaves pilot mode).
- `preview_resize`: the second drag produces a 1200×120 preview window (B-L32).
- `p2_xss_names`: `xss_probe` and (after the rename) `xss_probe2` are `true`, the third card's colour
  swatch gets the injected outline, and the second card's name input shows `Say ` (B-M4, B-L8, B-L16) (08 P2-3a:
  both probes are `false`, the cards and the logo list show the names as text and the input keeps `Say "hi"`; the
  injected outline stays until the colour rule of 08 P2-3b). Its ZIP holds four textures for six sections: `A B` and
  `A_B`, and the two `Dup`, share a name and overwrite each other (B-L14) (08 P2-6b: six unique names, `A_B_2` and
  `Dup_2` for the later ones, in the texture folder and the JSON `texture_file`).
- `box_corner`: the JSON inside the ZIP has no `angle_offset_degrees`, so its re-import
  (`zipjson_roundtrip__export-json`) lays the four sections out in a line (B-M3) (08 P2-6a: the ZIP JSON is the
  Export JSON document plus `texture_file`, and the round trip equals `final__export-json`).
- `p2_zip_section_mode` and `p2_xss_names`: the ZIP's MTL names `textures/Wall_<i>_PanelIDs.png` by index, which
  is not the file the ZIP holds for a named section (`Center_Stage_PanelIDs.png`) (B-M2) (08 P2-6d: the MTL names
  the ZIP entry, `textures/<textureFileNames entry>`).
- Every standalone section-mode MTL (`*section__export-obj__*.mtl`) has `map_Kd textures/Wall_<i>_PanelIDs.png`
  lines for textures Export OBJ never downloads (B-L7) (08 P2-6c: no `map_Kd`; the ZIP's MTL keeps them; 08 P2-6e:
  Export OBJ downloads one ZIP whose MTL references, and whose `textures/` folder holds, every section texture).
- `p2_curved_safe_distance`: each of the four exports throws the B-M1 `ReferenceError`, so no OBJ is
  produced (08 P2-5a: the four OBJs download); the `concave30` screenshot shows the folded band (B-M15) (08 P2-5b:
  the mitred, clamped band; the clamped stretches are amber, and the OBJs of `concave_offsets`, `box_corner` and
  `concave30` carry the `# Clamped:` header line).
- `p2_oversize_canvas`: Export Panel IDs throws `TypeError: Failed to execute 'createObjectURL' on
  'URL': Overload resolution failed.` and downloads nothing; the ZIP holds a 0-byte texture (B-L4)
  (08 P2-1a: the TypeError is an M-EXP-1 alert; 08 P2-1c: Export Panel IDs alerts M-EXP-2 and creates no
  canvas, and the ZIP leaves the texture out, with `texture_file: null`, no `map_Kd` and the M-EXP-4 alert;
  08 P2-1d: with panel IDs on, the viewport shows the section colour instead of a blank texture).
- `p2_zero_inputs`: Columns 2.5 was stored as typed (2.5 columns, 7.5 panels, an OBJ with fractional indices,
  B-L15) (08 P2-8a: it is rounded to 3, and every card snapshot records `step="1"` on the four integer inputs, the
  `max` of panel height and Pixels X/Y and the `min`/`max` of the panel angle).
- `p2_shortcut_filters`: `g` in the focused select turns translate mode on, Ctrl+G turns it off again,
  and the three auto-repeated `p` presses leave pilot mode on (B-L11) (08 P2-9b: the select is a typing target and
  Ctrl and auto-repeat are filtered, so translate mode and pilot mode stay off in steps 1 to 3).
- `p2_project_v2`: the JSON exports are v1 (sections and mesh mode only), so the restored page has the
  default camera, props, display and no logos (B-L31); the hostile file's logos are never stored, so
  `stored_svg_08_hostile` lists no SVG; `network.json` is empty (08 P2-3b: the step-8 file says `"version": "2.0"`,
  which is refused with M-IMP-4b until a v2 reader exists, so step 8 exports the wall of step 7).
- `p2_oversize_canvas`: since 08 P2-3b the import clamps the section's 70 columns to the 50-column limit (M-IMP-5),
  so the wall is 50,000 px wide: still beyond the 32,767 px of `CANVAS_HARD_LIMITS`, so M-EXP-2, M-EXP-4 and the
  viewport fallback are exercised as before (the harness browser itself could draw it).
- `p2_true_framing` (captured before 08 P2-11): Reset puts the camera at (W/2, H/2, 5) facing −Z whatever the wall,
  so on the half circle it stands at x = 2.5, beside the wall, and on the wall along +Z it looks past it; the orbit
  target is the centre of the flat bounds (B-L2). The status ignores the pan and the wall's shape: the 90° pan still
  reads "Exceeds wall" (B-M10). The frustum always reaches 15 m, through the wall (B-L33). `behind_wall`: Z −3 is
  clamped to 0.1 (Q13), and the camera, facing away from the wall, reads "Within bounds" (B-M10) (08 P2-11a: the
  frame is measured along the optical axis on the wall plane it is aimed at, so the 90° pan, the wall along +Z seen
  from the legacy Reset pose and `behind_wall` read "Not aimed at wall" with "—"; 08 P2-11b: the frustum ends where
  its corner rays meet the wall, else at that plane; 08 P2-11c: Reset stands 5 m in front of each wall along its chord
  facing, looking at the wall box centre (pan −99° on the half circle, −90° on the wall along +Z, 5.00 m from it), the
  orbit target is the centre of the real wall, and Z −3 is kept: the camera behind the wall, facing its back, reads
  "Not aimed at wall" with "—").

A candidate that fixes these will report the missing error as a WARN, and the newly produced
file as an EXTRA output (FAIL). Accept such a change deliberately through its expected-change
manifest ([Phase 2 re-baselining](#phase-2-re-baselining)).

## Limitations

- WASD/QE and pilot-mode movement depend on how many animation frames a key is held for, so they
  are not tested (see the manual checklist). The pilot fly speed set by the wheel is only
  observable through that movement.
- Gizmo hover highlighting is visible only while the mouse rests on a handle. The drags pass over
  it, but no screenshot is taken in that state.
- `ui_visual` does not cover `:hover` and `:focus` states. Scrollbar styling
  (`::-webkit-scrollbar`) is invisible, because Chrome runs with `--hide-scrollbars`. Media queries
  are covered only at 800 px wide.
- Window resizing is covered only by `ui_visual`'s narrow layout, not by a resize in the middle of a
  3D session.
- Results are tied to the Chrome version and its SwiftShader build. Capture the baseline and the
  candidate on the same machine and browser.

## Manual checklist (not automatable)

Check these side by side with the original (`node tools/serve.mjs --root tests/regression/output/original --port 8001`
next to `node tools/serve.mjs`) before a release:

1. WASD/QE orbit: hold each key and check that the target moves the same way and at the same speed.
2. Pilot fly: P (with the camera preview on), WASD/QE, the wheel speed change; W/S move vertically
   inverted relative to the look direction (B-M13), and Y never drops below 0.1.
3. Gizmo hover: hovering a handle highlights it (opacity 1.0) and leaving it restores 0.35; a drag
   dims the other handles.
4. Window resize: the canvas and the camera aspect follow the window; the preview window keeps its
   size.
5. GitHub Pages smoke test: open the deployed site under its sub-path (`/LED_Configurator/`), check
   that every `css/` and `js/` file loads (case-sensitive paths, no 404s in the network panel), and
   run one export of each kind.

## Static check (`tests/static/check.mjs`)

```bash
node tests/static/check.mjs              # checks js/ (prints "nothing to check" without a js/ directory)
node tests/static/check.mjs --self-test  # runs the checker against tests/static/fixtures/good and bad
```

It enforces the module rules of `docs/ARCHITECTURE.md` on every `.js` file under `js/` (no file is
exempt): import layering, relative and case-exact `.js` specifiers, `window` /
`document` only in the vendor shims, `ui/dom.js`, `app/App.js` and `main.js`, DOM-id lookups only in
`ui/` and `App.js` with one owner per id, no module-level `let` / `var`, `LEGACY(B-xx)` tags equal to
`LEGACY_SITES`, every `Events` key emitted and subscribed, every `Strategies` leaf referenced, no
THREE / DOM in the pure layers, domain fields written only by their owners (plus the
`ALLOWLIST` at the top of the file), since 01 F1-1, no numeric `renderOrder` literal of 900 or more outside
`js/core/renderOrder.js` (rule 11), and, since Feature 6 T1, inline `style=""` attributes of `index.html` that
declare only `display`, `width` and `height`, with no `var(--...)` and no colour literal (rule 12, 06 R-B2; every
other inline style is a class of `css/99-utilities.css`). Each violation is printed as `file:line: [rule N] message`,
and the exit code is 1 if there is any. Rule 6 also reports a `LEGACY_SITES` entry whose file under
`js/` does not exist.

The fixtures are small `js/` trees: `good` must pass and exercises every exemption (same-directory
imports, `statusEl.style.color`, a `windowEl` key, "THREE-free" comments, bug ids without the
`LEGACY(` prefix, `byId(doc, 'x')` lookups, `this.profile.<leaf>`, the allow-listed
`this.#display.showGrid` write) plus lexer edge cases (regex literals with quotes and slashes, a
regex right after an `if (...)` header, a `LEGACY(...)` tag wrapped across JSDoc lines). `bad` must
make every rule fire, and the self-test also checks a list of specific expected violations. Each tree also holds an
`index.html` for rule 12 (`good`: the allowed inline styles, a commented-out style and `data-style`; `bad`: a
property that is not allowed, a token and a colour literal in an allowed one, and an SVG style).

`node tests/static/css-slices.mjs --report-only` (07 S7) prints how `css/01-*.css` .. `css/12-*.css` differ from the
original stylesheet (lines 12-869 of `index.html@cd3fd3f`) and exits 0. Since Feature 6 T1 the slices differ on
purpose (the dead `.grid-lines` and `.section-color-0..7` rules are gone, and later branding steps rewrite rules), so
the gate and CI run it report-only; without the flag any difference is still a failure.

## Unit tests and the local server

```bash
node --test "tests/unit/**/*.test.mjs"   # quote the glob
node tools/serve.mjs [--port 8000] [--root .]
```

Since Node 21, `--test` arguments are globs: the directory form `node --test tests/unit/` fails with
"Cannot find module", and the unquoted glob is expanded (or not) by the shell. The quoted glob does
not match the `tests/unit/oracle/*.mjs` helpers. `tests/unit/compare.test.mjs` and
`tests/unit/tools.test.mjs` cover this harness's `--expect` gate and the structural checkers; the
oracle comparisons in `geometry.test.mjs` and `io.test.mjs` inject `LegacyProfiles.mesh.*` (the exact
Phase-1 profiles), while the golden comparisons use the production `Strategies.mesh.*`.

ES modules do not load from `file://`. `tools/serve.mjs` serves a directory on `http://127.0.0.1:<port>/`
with the harness's static server, which sends `.js` as `text/javascript`. Some Windows static servers
take the MIME type from the registry and send `text/plain`, which browsers refuse for module scripts.
The harness itself (`run.mjs`) starts the same server on an ephemeral port, so it can run while
`tools/serve.mjs` is up.
