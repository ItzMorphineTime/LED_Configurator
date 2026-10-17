/**
 * @module legacy/LegacyCompat
 * The single home of every output-affecting legacy switch and helper of Phase 1:
 * - `Strategies`: deep-frozen switches, each read at exactly one site (ARCHITECTURE.md 8.1);
 * - `LegacyProfiles`: the exact Phase-1 mesh profiles, read only by the oracle tests (ARCHITECTURE.md 3.3);
 * - legacy helpers that reproduce a preserved quirk (`orDefault`; `legacyHtml` was deleted by 08 P2-3a, B-M4);
 * - `unsupportedStrategy`, thrown by every switch-and-throw reader for a non-legacy value (ARCHITECTURE.md 1.5);
 * - `LEGACY_SITES`, the machine-readable register of every tagged legacy site.
 * The human-readable register is docs/ARCHITECTURE.md section 8 (8.1 switches, 8.2 quirks, 8.3 tag sites).
 * A later fix flips one value (plus its new code branch) or edits one tagged site, updates LEGACY_SITES and
 * re-baselines only the affected golden-master outputs.
 * Legacy source: index.html@cd3fd3f, every `|| default` input rule.
 * Layer: legacy (imports no other directory of js/).
 */

/**
 * Recursively freezes plain objects and arrays (module-private).
 * @template T
 * @param {T} value
 * @returns {T} the same value, frozen
 */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * Deep-frozen compatibility switches. Phase 1 implemented only the legacy value of every key, except the `dispose.*`
 * keys flipped by the non-observable Phase 1C clean-ups, which 08 P2-12a retired (wall rebuilds and the gizmo always
 * dispose; ARCHITECTURE.md 8.1). Phase 2 flips or retires keys one fix at a time
 * (docs/improvements/08-bugfix-roadmap.md 4.1); a flipped `mesh.*` key keeps its legacy case for `LegacyProfiles`.
 * Each leaf key is read at the site(s) named in ARCHITECTURE.md 8.1; enumerated keys are read with switch-and-throw,
 * the numeric keys are used as values,
 * `mesh.gltf.attributes` is iterated and each element switched (04 5.5), and the `mesh.*` profiles are injected into
 * the mesh builder and exporters as `profile`.
 * No module of WP3 reads any key.
 */
export const Strategies = deepFreeze({
  mesh: {
    viewport: { winding: 'ccw', normals: 'averaged', combinedUV: 'atlas-pixel-accurate', side: 'double' },
    obj:      { winding: 'ccw', normals: 'averaged', stripNormals: 'per-vertex',
                combinedUV: 'atlas-pixel-accurate', panelNormal: 'facing' },
    gltf:     { winding: 'ccw', normals: 'averaged', panelNormal: 'facing', attributes: ['POSITION', 'NORMAL', 'TEXCOORD_0'],
                combinedUV: 'atlas-pixel-accurate', indexType: 'auto',
                doubleSided: 'omit' },                     // 'omit' = the material object has NO doubleSided key
  },                                               // gltf.indexType: 'auto' since 08 P2-1b (B-L5), Phase-1 'uint16';
                                                   // viewport.winding: 'ccw' since 08 P2-2a (B-H1), Phase-1 'legacy-cw';
                                                   // viewport.normals: 'averaged' since 08 P2-2b (B-L3), Phase-1 'right-panel';
                                                   // obj winding/normals/stripNormals since 08 P2-2c (B-H2), Phase-1
                                                   // 'legacy-cw' / 'none' / 'constant-z'; gltf winding/normals/attributes
                                                   // since 08 P2-2d (B-H2), Phase-1 'legacy-cw' / 'none' / ['POSITION'],
                                                   // and the new leaf gltf.panelNormal (08 P2-2d);
                                                   // viewport.combinedUV: 'atlas-pixel-accurate' since 08 P2-7a (B-M5),
                                                   // Phase-1 'atlas-u-full-v'; obj.combinedUV: 'atlas-pixel-accurate'
                                                   // since 08 P2-7b (B-M6), Phase-1 'per-section-overlap';
                                                   // gltf.attributes + 'TEXCOORD_0' and the new leaf gltf.combinedUV since
                                                   // 08 P2-7c (B-M7)
  framingBounds: 'flat-pivot',                     // B-L2, B-M10; Phase-1 'flat' (03 T2: translated by the stage origin)
  curveBeforeFirstPanel: true,                     // B-L1
  frustumDepthM: 15,                               // B-L33
  gizmoRotateSign: -1,                             // B-M12
  pilotForwardYSign: -1,                           // B-M13
});                                                // dispose.wallTextures / dispose.gizmo (B-H5, B-L12: true since
                                                   // Phase 1C H1 / H2) retired by 08 P2-12a: always dispose;
                                                   // exportCombinedColor (B-L6) retired by 08 P2-7d: per-section materials;
                                                   // combinedLedSimColor (B-L18) retired by 08 P2-7e: white tile x vertex colours;
                                                   // previewRendersHelpers (B-M11) retired by 08 P2-10a: the preview hides helpers;
                                                   // previewRendererSize (B-M9) retired by 07 R2: one renderer, a scissor pass

/**
 * The exact Phase-1 mesh profiles (docs/improvements/08-bugfix-roadmap.md 4.2). Production code never reads these;
 * the oracle tests inject them into WallMeshBuilder / ObjExporter / GltfExporter so that the "builder == verbatim
 * oracle" tests stay meaningful after each Phase-2 flip of `Strategies.mesh`. Every value here must stay a supported
 * case of the builder and the exporters (a flipped key keeps its legacy case, ARCHITECTURE.md 8.1).
 * Global keys (for example `exportCombinedColor`) cannot be injected: when one is retired, the oracle cases that
 * depend on it become explicit expected-value tests in the same commit (08 P2-1a retired `gltfBase64`: the oracle
 * tests inject a copy of the Phase-1 spread encoder instead).
 */
export const LegacyProfiles = deepFreeze({
  mesh: {
    viewport: { winding: 'legacy-cw', normals: 'right-panel', combinedUV: 'atlas-u-full-v', side: 'double' },
    obj:      { winding: 'legacy-cw', normals: 'none', stripNormals: 'constant-z',
                combinedUV: 'per-section-overlap', panelNormal: 'facing' },
    gltf:     { winding: 'legacy-cw', normals: 'none', attributes: ['POSITION'], indexType: 'uint16',
                doubleSided: 'omit' },
  },
});

/**
 * The error every switch-and-throw reader throws in its `default` branch.
 * Side effects: none (the caller throws it).
 * @param {string} key    the Strategies key path, e.g. 'mesh.viewport.side'
 * @param {*} value       the unsupported value
 * @returns {Error} Error(`Unsupported strategy ${key}=${JSON.stringify(value)}`)
 */
export function unsupportedStrategy(key, value) {
  return new Error(`Unsupported strategy ${key}=${JSON.stringify(value)}`);
}

/**
 * The legacy `value || default` idiom used by every input rule table and import default.
 * LEGACY(B-L9): `v || d` (0, '', NaN fall back to the default). Every input rule table uses it.
 * Side effects: none.
 * @template V, D
 * @param {V} v
 * @param {D} d
 * @returns {V|D} v when truthy, otherwise d
 */
export const orDefault = (v, d) => v || d;

/**
 * Quirk register (ARCHITECTURE.md 8.2): bug id -> [preserved behaviour, how the fix lands]. Module-private.
 * A fixed quirk keeps its row (its fix text starts with 'Landed') but has no TAG_SITES pair, so LEGACY_SITES
 * no longer lists it.
 * @type {Readonly<Record<string, readonly [string, string]>>}
 */
const QUIRKS = deepFreeze({
  'B-H1': ['Viewport strip winding vs normals (C-5)',
    'Landed in 08 P2-2a (`mesh.viewport.winding = \'ccw\'`; `mesh.viewport.side = \'double\'` stays as a design choice; no tag site)'],
  'B-H2': ['Export winding, constant/contradicting normals, no doubleSided (R-5, S-2)',
    'Landed in 08 P2-2c (OBJ: `mesh.obj` winding `\'ccw\'`, normals `\'averaged\'`, stripNormals `\'per-vertex\'`) and 08 P2-2d (glTF: `mesh.gltf` winding `\'ccw\'`, normals `\'averaged\'`, panelNormal `\'facing\'`, attributes with `NORMAL`); no tag site'],
  'B-H3': ['glTF RangeError; ZIP dies silently (S-3, U-4)',
    'Landed in 08 P2-1a (`chunkedBase64` encoder; `ProjectIO.#runExport` reports every export failure; no tag site)'],
  'B-H4': ['Preview off in pilot: alert, stuck in pilot (O-8)',
    'Landed in 08 P2-4a (`PilotController.toggle` applies the preview guard only when entering pilot mode, so turning the preview off leaves pilot mode cleanly; `CameraRigView.remove` nulls `bodyMesh`; no tag site)'],
  'B-H5': ['Wall textures leak (memory only)',
    'Landed in Phase 1C H1 (`dispose.wallTextures = true`; the key retired by 08 P2-12a: every wall rebuild disposes the old material maps; no tag site)'],
  'B-M1': ['Safe-distance OBJ throws ReferenceError (K-3)',
    'Landed in 08 P2-5a (`downloader.saveBlob`; no tag site)'],
  'B-M2': ['Index-based MTL texture path (R-3)',
    'Landed in 08 P2-6d (`PanelNaming.mtlTextureFile(fileName)` is `textures/<fileName>`: the MTL `map_Kd` names the same `textureFileNames` entry as the ZIP texture and the JSON `texture_file`; `Strategies.mtlTextureNaming` retired; no tag site)'],
  'B-M3': ['ZIP JSON lacks angle offsets (U-1)',
    'Landed in 08 P2-6a (the ZIP JSON is the `\'file\'` document plus `texture_file` per section, so it keeps `angle_offset_degrees` and re-imports exactly; `Strategies.zipJsonIncludesAngleOffset` retired; no tag site)'],
  'B-M4': ['Unescaped names/colours/values in innerHTML (V-8)',
    'Landed in 08 P2-3a (`ui/dom.js escapeHtml` on every template interpolation of `SectionListPanel` and `SectionLogosPanel`, the live rename included; `legacyHtml` deleted; the colour validation is 08 P2-3b\'s; no tag site)'],
  'B-M5': ['Combined V full height (E-5)',
    'Landed in 08 P2-7a (`mesh.viewport.combinedUV = \'atlas-pixel-accurate\'`: v = (row / rows) * `uvHeight`, the section\'s share of the bottom-aligned atlas from `TextureAtlas.computeAtlas`, so combined panel IDs and the LED-sim repeat are pixel-accurate on sections of different heights; no tag site)'],
  'B-M6': ['Overlapping combined OBJ UVs (R-6)',
    'Landed in 08 P2-7b (`mesh.obj.combinedUV = \'atlas-pixel-accurate\'`: the combined OBJ `vt` are the viewport\'s pixel-accurate atlas UVs, `atlasUvRect` of each `computeAtlas` entry, so they match the combined panel-ID image; no tag site)'],
  'B-M7': ['glTF POSITION only (S-2)',
    'Landed in 08 P2-7c (`TEXCOORD_0` on every primitive, written (u, 1 - v): combined the pixel-accurate atlas UVs of the new leaf `mesh.gltf.combinedUV = \'atlas-pixel-accurate\'`, section 0..1 per section, panel `PANEL_UVS`; `NORMAL` landed in 08 P2-2d; no tag site)'],
  'B-M8': ['Safe-distance group survives preview off (K-2)',
    'Landed in 08 P2-4b (`CameraController.setPreviewEnabled(false)` calls `hub.syncSafeDistance()` after `rig.remove()`, which removes the floor; the next enable rebuilds it; no tag site)'],
  'B-M9': ['Preview 320x180 stretch (L-1)',
    'Landed in 07 R2 (the second renderer is deleted: the main renderer draws the preview into the main canvas by scissor at the client rect of the placeholder `#camera-preview-canvas`, letterboxed to the filmback aspect with black bars, `PreviewPass` and `PreviewFit.letterboxRect`; no window refit; `Strategies.previewRendererSize` retired; no tag site)'],
  'B-M10': ['Coverage from posZ against a flat rectangle (J-7, J-8)',
    'layout-aware analyser'],
  'B-M11': ['Preview renders helpers and tint (L-4)',
    'Landed in 08 P2-10a (`PreviewWindow.render(scene, helpers)` sets `visible = false` on every helper registered through `SceneManager.addHelper` for the preview render only and restores each flag afterwards (08 6.14), so the preview shows no grid, axes, rig, frustum tint, safe-distance floor or gizmo; no layer is assigned; `Strategies.previewRendersHelpers` retired; no tag site). Mechanism replaced by 07 R1: the preview camera\'s layer mask `DEFAULT | ENVIRONMENT` and `SceneManager.withPassHidden` for the gizmo'],
  'B-M12': ['Rotate gizmo direction inverted (N-9)',
    '`+1`'],
  'B-M13': ['Pilot vertical inverted (O-5)',
    '`+1`'],
  'B-M14': ['Select on mousedown; misses deselect (N-5)',
    'select on click under 4 px travel'],
  'B-M15': ['Overlapping/gapped safe-distance quads',
    'Landed in 08 P2-5b (`geometry/SafeDistanceBand.js buildSafeDistanceBand`: a mitred strip over `WallLayout.flatEdges()`, clamped near concave turns and concave curves so it never folds, clamped offset vertices tinted `safeZone.clampedColor` and counted in the OBJ `# Clamped:` line; `Strategies.safeDistanceBand` retired; no tag site)'],
  'B-M16': ['Panel-mode 4-16 px/LED per panel (E-10)',
    'Landed in 08 P2-12d (panel mode with panel IDs samples one section canvas per section, shared by its panels through section-space UVs; `TextureAtlas.panelPxPerLed` applies the wall-wide `PANEL_TEXTURE_BUDGET_PX` of `geometry/TextureBudget.js` to the per-panel canvases, which only 04\'s `uv.panel_uvs = \'panel\'` option still reaches; no tag site)'],
  'B-L1': ['Curve before the first panel (B-5)',
    'owner decision'],
  'B-L2': ['Flat bounds for target/reset/D (H-3, J-1, J-9)',
    'true bounds / pivot'],
  'B-L3': ['Right-panel normals',
    'Landed in 08 P2-2b (`mesh.viewport.normals = \'averaged\'` with the 01 CR-1 flat-section short-circuit; no tag site)'],
  'B-L4': ['No canvas-size guard (`toBlob` null throws, ZIP `data:,`)',
    'Landed in 08 P2-1c (export size guards: `canvasFits`, M-EXP-2/3/4, ZIP pre-check and late skip) and 08 P2-1d (viewport: a null panel-ID canvas falls back to the section colour with a console warning); no tag site'],
  'B-L5': ['Uint16 glTF indices',
    'Landed in 08 P2-1b (glTF `mesh.gltf.indexType = \'auto\'`, `indexWidth`) and 08 P2-1e (viewport: Uint32 index attribute from a largest index of 65,535); no tag site'],
  'B-L6': ['Combined exports use section 0\'s colour',
    'Landed in 08 P2-7d (one material per section in the combined exports: OBJ `newmtl Wall_<i+1>` with `usemtl` before each section\'s faces, glTF one primitive per section with its own accessors and `Wall_<i+1>_Material`; `LED_Wall_Combined` stays the object and mesh name; `Strategies.exportCombinedColor` retired; no tag site)'],
  'B-L7': ['MTL second download, textures missing',
    'Landed in 08 P2-6c (the standalone MTL has no `map_Kd`: `ObjExporter.write` references a texture only when the caller ships it (`textureNames`); `Strategies.mtlDownloadDelayMs` retired as `ProjectIO.MTL_DOWNLOAD_DELAY_MS`; the possibly blocked second download was an ARCHITECTURE 8.4 observation until 08 P2-6e, the owner\'s decision: Export OBJ downloads one ZIP with the OBJ, the MTL and every texture the MTL references; no tag site)'],
  'B-L8': ['No import validation; unknown mode renders as panels; raw coercion',
    'Landed in 08 P2-3b (`ProjectSerializer.read`: `detectVersion`, `migrateV1toV2` and `validateProject` of `io/ProjectMigrations.js`, `io/ProjectValidator.js`, `io/ProjectSchema.js`; `Strategies.importValidation` retired; `Wall.MAX_SECTIONS` with M-SEC-1; the size limit and the read error; the three-mode dispatch; `WallSection.setName`; no tag site)'],
  'B-L9': ['`|| default` turns 0 into the default (D-7, J-5, V-3)',
    'change `orDefault` or per rule'],
  'B-L10': ['Gizmo posY >= 0 vs pilot >= 0.1 per frame; Z unclamped',
    'validated setter'],
  'B-L11': ['Shortcuts ignore SELECT focus, modifiers, repeat (W-1)',
    'Landed in 08 P2-9b (`core/typingTarget.js isTypingTarget` with the 07 3.8 truth table, re-exported by `InputState` as `isShortcutIgnoredTarget`; `ViewportInput.attachShortcuts` also ignores Ctrl, Meta, Alt and auto-repeat; no tag site)'],
  'B-L12': ['Gizmo resources leak (memory only)',
    'Landed in Phase 1C H2 (`dispose.gizmo = true`; the key retired by 08 P2-12a: the replaced or removed gizmo group is always disposed; no tag site)'],
  'B-L13': ['Mesh-mode handler fires twice (C-4)',
    '"mode unchanged -> no-op" guard, never radio `change`'],
  'B-L14': ['Colliding ZIP texture names (U-3)',
    'Landed in 08 P2-6b (`PanelNaming.textureFileNames`: the legacy names made unique case-insensitively with `_2`, `_3` suffixes, the one list of the ZIP texture entries and the JSON `texture_file`; `zipTextureFileName` deleted; `Strategies.zipTextureNaming` retired; no tag site)'],
  'B-L15': ['Fractional integer fields (D-8); declared vertex advance',
    'Landed in 08 P2-8a (`WallSection.LIMITS`; the card rules round columns, rows and LEDs and cap panel height, LEDs and curve; `step="1"` and the `max` attributes on the card inputs; no tag site)'],
  'B-L16': ['4K ⚠ via `/Wall \\d+/` (D-10)',
    'Landed in 08 P2-3c (`ui/dom.js setTitleWithWarning`: the live rename and `SectionListPanel#patchCard` rebuild the title from the model; no tag site)'],
  'B-L17': ['4K check per section only',
    'wall-level check'],
  'B-L18': ['Combined LED sim white (E-4)',
    'Landed in 08 P2-7e (the combined LED-sim material multiplies a white tile by the per-section vertex colours, `vertexColors: true`; the LED tile cache key is the normalised `getHexString()` of the colour; `Strategies.combinedLedSimColor` retired; no tag site)'],
  'B-L19': ['Panel mode: no logos, fixed label size (F-4, G-4)',
    'viewport default fixed in 08 P2-12d (panel IDs sample the section canvas); the per-panel canvas is reachable only with `uv.panel_uvs = \'panel\'` (04 UV-9, with the panel-mode export UVs)'],
  'B-L20': ['Unbounded LED tile cache',
    'LRU or one shared tile'],
  'B-L21': ['Import keeps logos; no logo-list re-render (G-8)',
    'Landed in 08 P2-3d (`WallController.applyImport` resets the logo library (`LogoLibrary.clear`) and installs only the logos it is given; `SectionLogosPanel` re-renders on import with panel IDs on; no tag site)'],
  'B-L22': ['Prop Y arrow and X/Z rings inert (N-7)',
    '`Selectable.allowedAxes()`'],
  'B-L23': ['Local gizmo orientation stale (N-10)',
    'also re-orient'],
  'B-L24': ['Badge overlaps help badge (the `.view-btn.active` half landed in 01 F1-2)',
    'Landed in 06 T4a (`.selection-indicator` at `bottom: 64px`, stacked above `.viewport-info`; the `.view-btn.active` half in 01 F1-2; no tag site)'],
  'B-L25': ['View presets work in pilot (W-2)',
    'guard'],
  'B-L26': ['Gizmo visible in pilot',
    'hide/detach'],
  'B-L27': ['Frame-rate-dependent movement (I-3)',
    '`dt` from `startLoop`'],
  'B-L28': ['World rings write Euler channels',
    'quaternion composition'],
  'B-L29': ['Safe-distance floor faces -Y',
    'Landed in 08 P2-5b (every band triangle wound to face +Y; the safe-distance OBJ writes `vn` and `f a//a` faces; no tag site)'],
  'B-L30': ['Pose changes rebuild frustum + safe distance',
    'pose-only refresh'],
  'B-L31': ['JSON v1 saves only sections + mesh_mode (Q-3)',
    'v2 writer'],
  'B-L32': ['Preview resize clamp blow-out',
    'Landed in 07 R2 (the resize drag keeps the legacy width clamp and aspect, then clamps each axis on its own to 200-800 x 120-600 with `PreviewFit.clampPreviewSize`; no tag site)'],
  'B-L33': ['Frustum fixed 15 m',
    'clip at wall'],
  'B-L34': ['Preview header first word; fake resolution (L-3)',
    'short names'],
  'B-L35': ['Logo load: no error / zero-size guard',
    'guards'],
  'B-L36': ['Toggles not keyboard accessible',
    'markup + `flipToggle` keys'],
});

/**
 * Tag sites (ARCHITECTURE.md 8.3), in table order: [site, ids]. Sites outside js/ are documentation-only.
 * Module-private; LEGACY_SITES expands it to one entry per (id, site) pair.
 * @type {ReadonlyArray<readonly [string, readonly string[]]>}
 */
const TAG_SITES = deepFreeze([
  ['js/legacy/LegacyCompat.js#orDefault', ['B-L9']],
  ['js/domain/WallSection.js#exceeds4K', ['B-L17']],
  ['js/domain/Wall.js#flatBounds', ['B-L2', 'B-M10']],
  ['js/domain/CineCamera.js#coverage', ['B-M10']],
  ['js/domain/CineCamera.js#presetShortName', ['B-L34']],
  ['js/domain/CineCamera.js#translateBy', ['B-L10']],
  ['js/domain/CineCamera.js#rotateBy', ['B-L28']],
  ['js/domain/CineCamera.js#pilotFly', ['B-L10']],
  ['js/domain/Prop.js#translateBy', ['B-L22']],
  ['js/domain/Prop.js#rotateBy', ['B-L22']],
  ['js/geometry/WallLayout.js#computeWallLayout', ['B-L1']],
  ['js/geometry/WallLayout.js#framingBounds', ['B-L2', 'B-M10']],
  ['js/io/ProjectSerializer.js#write', ['B-L31']],
  ['js/render/textures/LEDPixelTextureFactory.js#tile', ['B-L20']],
  ['js/render/textures/PanelIdRenderer.js#panelCanvas', ['B-L19']],
  ['js/render/textures/PanelIdRenderer.js#sectionCanvas', ['B-L35']],
  ['js/render/CameraRigView.js#rebuildFrustum', ['B-L33']],
  ['js/render/PreviewPass.js#updateCamera', ['B-L34']],
  ['js/interaction/OrbitController.js#updateTargetPosition', ['B-L2']],
  ['js/interaction/OrbitController.js#tickKeyboard', ['B-L27']],
  ['js/interaction/OrbitController.js#setView', ['B-L25']],
  ['js/interaction/SelectionManager.js#pickAt', ['B-M14']],
  ['js/interaction/TransformGizmo.js#rebuild', ['B-L22', 'B-L26']],
  ['js/interaction/TransformGizmo.js#updatePosition', ['B-L23']],
  ['js/interaction/TransformGizmo.js#onMouseMove', ['B-M12']],
  ['js/interaction/PilotController.js#toggle', ['B-L26']],
  ['js/interaction/PilotController.js#tickKeyboard', ['B-M13', 'B-L27']],
  ['js/interaction/ViewportInput.js#attachPointer', ['B-M14']],
  ['js/app/WallController.js#setMeshMode', ['B-L13']],
  ['js/app/CameraController.js#CameraHub.refresh', ['B-L30']],
  ['js/ui/SectionLogosPanel.js#onUpload', ['B-L35']],
  ['js/ui/WallDisplayPanel.js#bind', ['B-L13']],
  ['index.html', ['B-L36']],                   // markup, untagged; documentation-only
]);

/**
 * Register of every tagged legacy site (ARCHITECTURE.md 8.2 and 8.3). Frozen array of frozen entries
 * { id: 'B-M14', site: 'js/interaction/ViewportInput.js#attachPointer', behaviour: '...', fix: '...' },
 * exactly one per (bug id, site) pair of the 8.3 table, in table order. Entries whose site is not under
 * js/ (CSS, markup) are documentation-only. tests/static/check.mjs compares, per js/ file, the ids of its
 * LEGACY tags with the ids of the entries whose site starts with that file's path followed by '#'.
 * @type {ReadonlyArray<Readonly<{id: string, site: string, behaviour: string, fix: string}>>}
 */
export const LEGACY_SITES = Object.freeze(
  TAG_SITES.flatMap(([site, ids]) => ids.map((id) => Object.freeze({
    id,
    site,
    behaviour: QUIRKS[id][0],
    fix: QUIRKS[id][1],
  }))),
);
