# Golden-master regression harness

A black-box, zero-dependency harness that drives the LED Wall Configurator in headless Chrome,
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
| `p2_xss_names` | 14 | Phase 2: markup, quotes, spaces and duplicates in section names and a CSS-injecting colour (B-M4, B-L8, B-L14, B-M2, B-L21). |
| `p2_zip_section_mode` | 8 | Phase 2: `flat3` in section mode with a renamed section; MTL texture paths against the ZIP entries (B-M2, B-L7). |
| `p2_curved_safe_distance` | 11 | Phase 2: the safe-distance floor on four curved or cornered walls, screenshot and OBJ export each (B-M15, B-L29, B-M1). |
| `p2_zero_inputs` | 9 | Phase 2: zero and fractional inputs (B-L9, B-L15, Q13). |
| `p2_oversize_canvas` | 6 | Phase 2: a wall wider than the browser's canvas limit (B-L4). |
| `p2_mixed_content` | 7 | Phase 2: LED sim and panel IDs on mixed section heights (B-M5, B-L18). |
| `p2_shortcut_filters` | 8 | Phase 2: shortcut keys in a focused select, with Ctrl, auto-repeated, and a view preset in pilot mode (B-L11, B-L25). |
| `p2_project_v2` | 34 | Phase 2: a full project save and restore, a save with the preview off, hostile v2 logos; the only scenario with `network.json` (B-L31, B-L35, B-L36). |

The seven scenarios after `ui_visual` live in [`scenarios-extra.mjs`](scenarios-extra.mjs) and are
spread into `SCENARIOS` after the original entries. The eight `p2_*` scenarios live in
[`scenarios-phase2.mjs`](scenarios-phase2.mjs) and are spread in after them (see
[The Phase 2 scenarios](#the-phase-2-scenarios)).

The six config scenarios follow the same steps:

1. Record stats, the mesh-mode radio state and a section snapshot after import.
2. Export JSON.
3. For each of combined, section and panel modes: Export OBJ (and the MTL that follows it ~100 ms later), then Export glTF.
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
subsets for `°×•—`.

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

[`scenarios-extra.mjs`](scenarios-extra.mjs) adds seven scenarios for code paths the scenarios above
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
| i | Preview and safe distance on, import `{"version":"1.0","sections":[],"mesh_mode":"combined"}`, then Add Section, Export OBJ, glTF and JSON | No error on import (the safe-distance group is built empty); stats `0`; Add throws `TypeError ... (reading 'panelCols')`; OBJ and glTF throw `TypeError ... (reading 'color')` from `sections[0]`; JSON downloads `sections: []` |
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
(`name_01_per_keystroke.json`). The name contains markup, so the unescaped `innerHTML` (B-M4) shows
in the title and the logo list. It also contains the shortcut letters g, r, p and l, so the gizmo
state recorded after typing proves that the shortcut handlers ignore INPUT targets (B-L11). Then it
exports the panel-ID PNG and JSON, clears the field with Backspace, and exports again: the model
falls back to `Wall 1` (title, logo list, JSON) while the input stays empty.

### `preview_off_in_pilot` (B-H4: 3477-3509, 4229-4249)

Turns the preview on and presses P (pilot on), then turns the preview off. The toggle-off handler
calls the pilot toggle after the preview flag is already false, so it alerts `Enable Camera Frustum
Preview first to use Pilot Mode` and stays in pilot mode (`#gizmo-pilot.active`,
`#pilot-info.visible`, the main camera keeps the pilot view). P and Escape alert again. Turning the
preview back on re-drives the pilot view, and P then leaves pilot mode. Each state records the gizmo
classes, the camera panel and the dialogs so far.

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
   is not on the bottom edge), G, pick the orange camera body, drag the X arrow: `#camera-pos-*` and
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
`docs/improvements/08-bugfix-roadmap.md` section 8.3. They were captured at P2-0 against the
**unfixed** code, so their baselines document the bugs; each later fix changes them on purpose,
through its expected-change manifest. They follow the same DOM-only rules as the other scenarios.

- **Export labels** are `<mesh mode>__<button>` (`section__export-obj`, `combined__export-zip`, ...) or
  `<wall>__export-safe-distance`, so the segment-agnostic manifest patterns
  (`**/*section__export-obj__*.mtl`, `**/*combined__export-*`) cover them like the config scenarios.
- **No reachable URL** is ever part of a payload: hostile URLs use the `.invalid` top-level domain,
  which never resolves. A request to one would be recorded as a `network` error, and
  `p2_project_v2/network.json` lists every request to another origin.
- **Fresh pages** inside a scenario use `AppPage.reload()`.

| Scenario | Steps | Records |
|---|---|---|
| `p2_xss_names` | Import six 2×1 sections named `<b id="xss-probe">B</b>`, `Say "hi"`, `A B`, `A_B`, `Dup`, `Dup` (the third with the colour `red;outline:3px solid lime`) in section mode; probe; panel IDs on; probe; rename card 1 (the second card) to `<i id="xss-probe2">i</i>` with one `input` event; probe; `section__export-obj`, `section__export-zip` | `sections_initial`, `sections_renamed`, `xss_probe_0{0,1,2}_*` (`xss_probe`, `xss_probe2`, and per card whether the colour injected an outline), `logos_0{1,2}_*`, MTL, ZIP entries and ZIP JSON |
| `p2_zip_section_mode` | Import `flat3` in section mode, rename `Center` to `Center Stage`, `section__export-obj`, `section__export-zip` | `sections_renamed`, MTL, ZIP entries |
| `p2_curved_safe_distance` | For `concave_offsets`, `convex`, `box_corner` and the inline `concave30` (one section, 6 × 4 panels of 500 mm, curve +30°), each on a fresh page: import; preview on; camera at (3, 1.5, 6); safe distance on; screenshot `<wall>`; `<wall>__export-safe-distance` | 4 screenshots, the OBJs (none while B-M1 throws), `console.json`, `downloads.json` |
| `p2_zero_inputs` | Preview on; camera Y and Z = 0; card 0 width 0 and columns 2.5; panel IDs on with border 0; `combined__export-obj` | `camera_zero`, `sections_zero`, `stats_zero`, `ui_zero_border`, OBJ and MTL |
| `p2_oversize_canvas` | Import one section of 70 × 2 panels with 1000 × 64 LEDs (a 70,000 × 128 px atlas) in section mode; `section__export-panel-ids`; `section__export-zip`; panel IDs on; screenshot `panel_ids_viewport` | `dialogs.json`, `console.json` (Export Panel IDs throws a `TypeError` today), `downloads.json`, ZIP entries and MTL (a 0-byte texture today), the screenshot |
| `p2_mixed_content` | Import `mixed`; LED sim on (combined), screenshot; layout `square`, screenshot; panel IDs on, screenshot | 3 screenshots |
| `p2_shortcut_filters` | LED sim on, focus `#led-layout`, press `g`; blur, Ctrl+G; preview on, `p` as three auto-repeat key downs; Escape and one `p` (pilot on from either state), click `#view-front`, screenshot | `gizmo_0{1..4}_*` (gizmo state, focused element, `#led-layout` value), `pilot_view_front` |
| `p2_project_v2` | 1. preview on, custom filmback 30×20, focal 50, pose (2, 1.2, 4) / (5, −10, 2), safe distance on. 2. person at (1, 3), rot 45, scale 1.5; car on. 3. Add Section (so that section 1 exists), LED sim on then panel IDs on, border 12, font colour `#ff0000`, the 16×8 test PNG on section 0, a generated 2,000,000-byte 24-bit noise BMP on section 1, wireframe on. 4. `v2_first__export-json`. 5–6. fresh page, import it, record, screenshot, `v2_second__export-json`. 7. preview off (only if on), `v2_off__export-json`, fresh page, import it, preview on (only if off), record. 8. import an inline one-section v2 file whose `assets[]` hold an `https://` URL, a `data:text/html` URI, a data URI with a base64 length that is not a multiple of 4, and an SVG with `<script>`, `<foreignObject>` and an external `href` (the section's logo); `combined__export-panel-ids`, `combined__export-zip` | `camera_*`, `ui_*`, `aria_*` (every `.toggle`: `.active`, `role`, `aria-checked`, `tabindex`), `logos_*` (the list with every `data-*` attribute), `dialogs_page{1,2,3...}` (dialogs per page), the three JSON exports, the screenshot, `network.json` |

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

## Output layout

```
<out>/manifest.json                      { meta, scenarios: { name: { description, durationMs, outputs } } }
<out>/<scenario>/<step>__<filename>      every downloaded file, byte-for-byte
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
  must match exactly. A failing style snapshot is reported per element, style changes before rect
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
  more often (`camera`, `gizmo_drag`, `import_edge` `i_empty`, `toggles` `15_car_moved`, ...),
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
  self-consistency runs; see [Phase 2 re-baselining](#phase-2-re-baselining)).
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
#    Export commits also run the structural checks on the candidate outputs:
node tools/check-orientation.mjs tests/regression/output/candidate/*/*.obj tests/regression/output/candidate/*/*.gltf
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
  filename-agnostic patterns for whole output kinds (`**/*__export-obj__*.obj`,
  `**/*combined__export-*`); use explicit names only for single outputs, checked against the
  parent's baseline listing. Write manifests by grepping the parent's baseline, never from memory
  (08 section 8.2, R10).
- `change` is `added` (only in the candidate), `removed` (only in the baseline) or `modified`.
- `mayChange` entries take an optional `change` and a `reason`; plain pattern strings are accepted.
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

- `node tools/check-orientation.mjs <file.obj|file.gltf ...>`: for every triangle, the geometric
  normal of its counter-clockwise winding has a positive dot product with the vertex normal at each
  of its three vertices; one PASS/FAIL line per object, exit 1 on any failure. A face without vertex
  normals fails. Today every OBJ and glTF fails it (B-H1, B-H2) until 08 P2-2.
- `node tools/check-gltf.mjs <file.gltf ...>`: buffer, bufferView and accessor bounds, component and
  4-byte alignment, index values below the vertex count and never the primitive-restart value,
  `POSITION` min/max compared after `Math.fround`, unit `NORMAL`s, the `TEXCOORD_0` count, and the
  mesh, material, node and scene references; exit 1 on any failure. Today the string-number glTFs of
  `import_edge` (`ii_combined`, `ii_section`) fail it (indices beyond the vertex count, B-L8) until
  08 P2-3b.

Their unit tests are `tests/unit/tools.test.mjs`; the `--expect` semantics are unit-tested in
`tests/unit/compare.test.mjs` on synthetic output trees.

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
- **Mesh mode:** `#mesh-mode-select input[name="mesh-mode"][value=combined|section|panel]`. The
  harness clicks the enclosing `<label>` and records `.active` on that label.
- **Section cards:** the direct children of `#wall-sections`. Inside a card it uses
  `input[data-field=panelCols|panelRows|panelWidth|panelHeight|ledX|ledY|curveIntensity|angleOffset]`,
  `.section-name-input`, `input[type=color]`, `[data-color]` swatches (with `.active`),
  `.section-header`, `.section-delete[data-id]` and the `.collapsed` class.
- **State classes:** `.active` on toggles and gizmo buttons, `.visible` on
  `#selection-indicator` and `#pilot-info`, `.world` and `.local` on `#gizmo-space`, and
  `.selected-name` text inside the indicator.
- **Downloads:** captured from `<a download>` elements, whether clicked with `.click()` or a
  dispatched click event, with blob or data URLs. Downloads made any other way, such as
  `showSaveFilePicker`, would show up as missing outputs.
- **`ui_visual`:**
  - It uses every selector in [`ui-spec.mjs`](ui-spec.mjs), for example `.header`, `.logo-text span`,
    `.stat-value`, `.control-panel`, `.global-section`, `.toggle`, `.mesh-mode-option`,
    `.input-field`, `.export-btn.secondary`, `.camera-info`, `.frustum-status`, `.view-btn`,
    `.gizmo-mode-btn`, `.gizmo-divider`, `.company-logo`, `.subsection-title`, the
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
    `#camera-preview-window`, and the `width` / `height` attributes of `#camera-preview-canvas`;
  - the children of `.viewport-overlay`, and `#camera-preview-window` itself, as the overlay rects
    that pixel searches skip;
  - the scene colours that pixel searches look for: the person (0x4488ff @ 0.85), the camera body
    (0xff6600 @ 0.8) and the gizmo's red and green handles (0xff4444 / 0x44ff44 @ 0.35).

## Baseline facts worth knowing

These were observed in the original app and are part of the golden master:

- `camera`: Export Safe Distance OBJ throws `ReferenceError: downloadBlob is not defined`, so no file is produced.
- `large_wall`: Export glTF in panel mode throws `RangeError: Maximum call stack size exceeded`
  from `btoa(String.fromCharCode(...buffer))`, so no file is produced.
- `import_edge`: after importing an empty wall, Add Section throws
  `TypeError: Cannot read properties of undefined (reading 'panelCols')`, and Export OBJ and Export
  glTF throw `TypeError: Cannot read properties of undefined (reading 'color')`. Importing `null`
  alerts `Error parsing JSON file: Cannot read properties of null (reading 'sections')`, and the
  malformed file alerts `Error parsing JSON file: Unexpected end of JSON input`.
- `preview_off_in_pilot`: three alerts `Enable Camera Frustum Preview first to use Pilot Mode`, and
  pilot mode stays on until the preview is enabled again (B-H4).
- `preview_resize`: the second drag produces a 1200×120 preview window (B-L32).
- `p2_xss_names`: `xss_probe` and (after the rename) `xss_probe2` are `true`, the third card's colour
  swatch gets the injected outline, and the second card's name input shows `Say ` (B-M4, B-L8, B-L16).
- `p2_curved_safe_distance`: each of the four exports throws the B-M1 `ReferenceError`, so no OBJ is
  produced; the `concave30` screenshot shows the folded band (B-M15).
- `p2_oversize_canvas`: Export Panel IDs throws `TypeError: Failed to execute 'createObjectURL' on
  'URL': Overload resolution failed.` and downloads nothing; the ZIP holds a 0-byte texture (B-L4).
- `p2_shortcut_filters`: `g` in the focused select turns translate mode on, Ctrl+G turns it off again,
  and the three auto-repeated `p` presses leave pilot mode on (B-L11).
- `p2_project_v2`: the JSON exports are v1 (sections and mesh mode only), so the restored page has the
  default camera, props, display and no logos (B-L31); `network.json` is empty.

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
THREE / DOM in the pure layers, and domain fields written only by their owners (plus the
`ALLOWLIST` at the top of the file). Each violation is printed as `file:line: [rule N] message`,
and the exit code is 1 if there is any. Rule 6 also reports a `LEGACY_SITES` entry whose file under
`js/` does not exist.

The fixtures are small `js/` trees: `good` must pass and exercises every exemption (same-directory
imports, `statusEl.style.color`, a `windowEl` key, "THREE-free" comments, bug ids without the
`LEGACY(` prefix, `byId(doc, 'x')` lookups, `this.profile.<leaf>`, the allow-listed
`this.#display.showGrid` write) plus lexer edge cases (regex literals with quotes and slashes, a
regex right after an `if (...)` header, a `LEGACY(...)` tag wrapped across JSDoc lines). `bad` must
make every rule fire, and the self-test also checks a list of specific expected violations.

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
