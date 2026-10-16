# Verified defect list (original single-file app)

This is the verified defect list of the original single-file app: `index.html` at commit `cd3fd3f`, before the Phase 1 refactor into ES modules. Every line number below refers to that version of the file (`git show cd3fd3f:index.html`), not to the current `index.html` or to `js/`.

The ids defined here are the bug ids used throughout the repository:
- `docs/ARCHITECTURE.md` §8 isolates each id behind one `Strategies` switch or one `// LEGACY(B-xx)` site (the `LEGACY_SITES` register), so the Phase 1 refactor preserves each defect exactly (Phase 1C then fixed the memory-only B-H5 and B-L12).
- `docs/improvements/08-bugfix-roadmap.md` (Phase 2) fixes each id in its own re-baselined commit; its §5.6 is the single bug-ownership table.

This file is a snapshot of the defects as found, and it is not updated as fixes land. The current state of each id (open, landed, or decided, such as the B-L1 curve convention) is in ARCHITECTURE.md §1.4 and §8.2 and in 08 §5.6.

## Scope and method
- **What is included:** every reported defect that was independently confirmed against the code. Duplicate reports from the six per-subsystem reviews are merged.
- **Severity:** where reviews disagreed, the most defensible verified severity is used and the disagreement is noted.
- **Line numbers:** they refer to `index.html` at `cd3fd3f` (CSS 11-870, markup 872-1276, script 1277-5096).
- **IDs:** B-H = high, B-M = medium, B-L = low (5 + 16 + 36 = 57 ids).
- **Features:** the "Feat" tag names the planned feature each bug touches (1 normals, 2 section select/offsets, 3 pivot, 4 UVs, 5 HDRI/car, 6 branding).

---

## High

### B-H1: Viewport strip meshes are wound opposite to their stored normals (line 1638; also 1749). Feat 1, 5
- **Defect:** combined and section meshes push indices `(bl, tl, tr, bl, tr, br)`.
  - Seen from +Z (the stage side) this order is clockwise. The face normal is `(sin a, 0, −cos a)`, which is −Z on a flat wall.
  - The stored per-vertex normals (1614-1615 and 1729-1730, `nx = −dz/len, nz = dx/len`) are `(−sin a, 0, cos a)`, the exact opposite.
- **Why it is invisible today:** every material is DoubleSide, unlit `MeshBasicMaterial`.
- **Impact once materials change:** any FrontSide material would cull the wall from the front. Any lit or env-mapped DoubleSide material would shade the front with flipped normals.
- **Out of scope:** panel mode (`PlaneGeometry`, 1782) is already consistent and must not be flipped.
- **Fix:** change the index order to `(bl, br, tr, bl, tr, tl)` in one shared builder. Keep the normals as they are.

### B-H2: Every export carries the inverted winding plus wrong or missing normals (lines 4599, 4844, 4887, 4589, 4635, 4819). Feat 1
- **OBJ faces** are clockwise from +Z in all three modes:
  - combined: 4599-4600;
  - section: 4648-4649;
  - panel: corners BL, BR, TR, TL at 4685-4690, faces `v, v+3, v+2 / v, v+2, v+1` at 4705-4706.
- **glTF indices** are clockwise too: 4844, 4863, and `[0,3,2,0,2,1]` at 4887.
- **OBJ normals:** combined and section modes write a single `vn 0 0 1` (4589, 4635), which is wrong for any curved or angle-offset section. Panel mode writes a correct `vn` (4698-4700), but it contradicts the face winding.
- **glTF normals:** the primitive carries POSITION only (4819), and the materials are not `doubleSided` (4739-4746). Viewers derive −Z normals from the winding and back-face cull the wall when it is seen from the front.
- **Owner's report:** this is almost certainly the "inverted normals" the owner reported. A Node run on a 5° curved wall gave face normal (0.087, 0, −0.996) against OBJ `vn` (−0.087, 0, 0.996).
- **Fix:** use a shared mesh builder with the corrected winding, write per-vertex `vn` and glTF NORMAL, and add a doubleSided option.

### B-H3: glTF base64 encoding throws RangeError, which also kills the ZIP export (line 4902)
- **Defect:** `btoa(String.fromCharCode(...combinedBuffer))` spreads one argument per byte.
  - V8 throws RangeError at about 125 KB (120,000 bytes passes, 130,000 throws). JavaScriptCore throws at about 65k.
  - Panel mode uses about 60 bytes per panel, so it fails at about 2,100 panels. The harness `large_wall` scenario (3,200 panels) is enough.
  - Combined and section modes use about 25 KB per 50×20 section, so they fail at 6 or more such sections.
- **Impact:** `exportZIP` calls `generateGLTFContent` at 4529, inside an async function with no try/catch. The whole ZIP export dies as an unhandled rejection: no download, no message.
- **Review disagreement:** one review rated this low. It is kept high because it breaks two export buttons silently at realistic sizes.
- **Fix:** encode in chunks, or emit a GLB or Blob. Wrap the exports in try/catch and report errors to the user.

### B-H4: Turning off the camera preview while in pilot mode leaves the app stuck in pilot mode (line 4241)
- **Defect:** the #toggle-camera-preview handler sets `cameraPreviewEnabled = false` at 4232, then calls `togglePilotMode()`. That function's guard (3478-3481) alerts and returns before it flips `pilotMode` at 3483.
- **Impact:**
  - Orbit drag, wheel zoom and WASD orbit stay disabled (3768, 3822, 3827, 3836).
  - P, Esc and #gizmo-pilot only repeat the alert.
  - `#pilot-info` stays visible.
  - The only way out is to re-enable the preview and then press P.
- **Fix:** exit pilot mode before clearing the flag, or apply the guard only when entering pilot mode.

### B-H5: Wall rebuilds never dispose textures, so GPU textures accumulate (lines 1458-1466)
- **Defect:** `createLEDWall` disposes geometries and materials but never `material.map`, and three r128 `Material.dispose()` does not release textures. On every rebuild these are orphaned:
  - panel-ID `CanvasTexture`s (1668, 1762, 1787);
  - LED-sim clones (1810/1855, through 1981). Each clone is its own GL upload in r128.
- **Impact:**
  - `renderer.info.memory.textures` only grows. GL objects are freed only on a non-deterministic GC, because three keeps them in a WeakMap.
  - Rebuilds fire on `input` events: section colour (4005-4010), panel font colour (4210-4213), section label colour (4224-4227), and name keystrokes when panel IDs are on (4014-4022). Dragging a colour picker in panel mode with panel IDs on (512² or larger per panel) can allocate hundreds of MB per second and risk WebGL context loss.
  - The preview renderer (3636) uploads every texture again in a second context.
  - `clearLEDTextureCache` (1986-1989) disposes only the cached masters, which are never rendered.
- **Review disagreement:** one review rated this medium. It is kept high.
- **Fix:** use a shared `disposeObject3D` that also disposes maps, as `removeSafeDistanceMesh` already does at 2770. Share one LED tile texture instead of cloning it. Debounce colour inputs.

---

## Medium

### B-M1: "Export Safe Distance OBJ" always throws ReferenceError (line 2826)
- **Defect:** `exportSafeDistanceOBJ` (2786-2827) calls `downloadBlob(blob, 'safe-distance-floor.obj')`, which is defined nowhere. The only helper is `downloadFile` at 5082. The button is wired at 4329, so every click with a mesh present throws.
- **Review disagreement:** severity was rated high in one review and medium in two. The feature is fully broken, but the fix is one line.
- **Fix:** call `downloadFile(objContent, 'safe-distance-floor.obj', 'text/plain')`.

### B-M2: MTL texture paths do not match the texture filenames written into the ZIP (line 4612)
- **Defect:** in section mode the MTL hard-codes `map_Kd textures/Wall_${i+1}_PanelIDs.png`, while `exportZIP` writes `${sanitizeFilename(section.name)}_PanelIDs.png` (4540, 4496).
- **Impact:** the link breaks when a section is renamed, or after a middle section is deleted, because names are not renumbered.
- **Fix:** derive the filename from one `TextureNaming.forSection` helper used by both writers.

### B-M3: The ZIP's JSON config drops `angle_offset_degrees` (line 4506)
- **Defect:** `exportZIP` builds its own copy of the config (4499-4519), and that copy has drifted from `exportJSON`, which includes the field at 4953.
- **Impact:** re-importing the ZIP's JSON resets every section offset to 0 (importJSON reads the field at 4986), which changes the wall shape.
- **Fix:** use a single serializer for both exports.

### B-M4: Section names and colours are injected unescaped into innerHTML and attributes (line 3925; also 3923, 3939, 3976, 4017, 2202)
- **Sinks:** `renderWallSections` writes the name into the title (3925), the input `value="…"` (3939), the colour style (3923) and the colour input value (3976). The live rename (4017) and `renderSectionLogosUI` (2202) are further sinks.
- **Source:** `importJSON` (4978, 4987) accepts any string and renders it immediately (4998). An imported name such as `<img src=x onerror=…>` runs script.
- **Even without import:** a typed name containing `"` is truncated in the input after a re-render, and editing it then saves the truncated name.
- **Fix:** render with `textContent` or attribute setters, and validate imported names (length) and colours (hex).

### B-M5: Combined-mode V coordinates ignore differing section heights (line 1627)
- **Defect:** the atlas is `max(rows·ledY)` tall (1684, 1690), with sections bottom-aligned (1701-1702, under `flipY`). Every section's mesh, however, maps `v = row/rows` over the full 0..1 range.
- **Impact:**
  - A shorter section samples empty background at its top, and its labels and logo are squashed.
  - Combined LED sim (1672) repeats `totalLedY` rows over every section's full height.
  - The default mode is combined, so any wall with mixed pixel heights shows this.
- **Fix:** `v = (row/rows)·(rows·ledY/totalLedY)`, or a per-section UV mode. Feat 4.

### B-M6: Combined-mode OBJ UVs overlap and match neither the viewport atlas nor panel-ids.png (line 4584)
- **Defect:** each section writes `vt` values over 0..1 (4581-4587) inside the single `LED_Wall_Combined` object. The viewport (1627) and `exportPanelIds` (4928) both use a horizontal atlas laid out by pixel share.
- **Fix:** have the OBJ writer use the shared UV function. Feat 4.

### B-M7: The glTF export has no TEXCOORD_0 and no NORMAL (line 4819)
- **Defect:** `addMesh` (4737-4828) creates only POSITION and index accessors.
- **Impact:** no texture (panel IDs, LED content, HDRI bake) can be applied in any DCC or engine. Normals have to be guessed from the inverted winding (see B-H2).
- **Fix:** export from the shared builder, possibly through `THREE.GLTFExporter` r128. Feat 1, 4, 5.

### B-M8: Disabling the camera preview leaves a stale safe-distance mesh (line 2536 / 4238)
- **Defect:** `removeCameraPreview` (2536-2548) touches only `previewCameraGroup`. `safeDistanceMesh` was added directly to the scene (2761).
- **Why it stays stale:** `updateCameraFrustum` returns early once the preview is off (2452), and `createLEDWall` gates on the preview flag (1576), so wall edits no longer refresh the overlay.
- **Hard to remove:** its toggle (1100) sits inside the now-hidden `#camera-preview-options`. The workaround is to re-enable the preview, which resets the camera pose, and then toggle the overlay off.
- **Fix:** call `removeSafeDistanceMesh()` in the disable path.

### B-M9: The camera preview image is distorted (line 3637)
- **Defect:** the renderer is fixed at 320×180 (16:9), but `previewCamera.aspect` is the filmback aspect (1.5 for full frame; 3705/3711), so the image is stretched about 18.5% horizontally.
- **Never re-fitted:** later filmback or focal changes do not refit the window. Only dragging the resize handle (3664-3692) fixes it.
- **Clipping:** `setSize` uses the outer size (2 px border, global `border-box`), so the canvas is 4 px larger than the content box and is clipped on the right and bottom.
- **Fix:** size from `clientWidth/clientHeight` and refit to the filmback on every lens change.

### B-M10: Frame-at-wall status ignores camera rotation and the real wall geometry (line 2477)
- **Defect:** `calculateFrustumIntersection` (2471-2534) assumes the following:
  - the distance is `posZ`;
  - pan, tilt and roll are irrelevant (rot values are never read);
  - the wall is the rectangle [0, Σ arc width] × [0, max height] in the z = 0 plane.
- **Impact:** a camera panned 90° away still reports "Within bounds". Curved, angled and short sections are misjudged. The comment at 2479 admits the simplification, but the UI does not.
- **Fix:** use a `FrustumCoverageAnalyzer` that projects or raycasts against the real layout. Feat 2, 3.

### B-M11: The camera preview renders scene helpers, including a full-frame orange tint (line 3744)
- **Defect:** the whole scene is rendered with no layer filtering.
- **Tint:** the frustum fill's near-plane quad (local z = −0.2, exactly the camera's FOV, opacity 0.08; 2412-2427) covers the whole preview frame, because the preview near plane is 0.1.
- **Other helpers that show:** the rotate gizmo (depthTest off, 3017) draws across the frame when the camera is selected. The grid, axes and safe-distance overlay also appear.
- **Fix:** put helpers on a HELPERS layer and exclude it from `previewCamera.layers`. Feat 5 (clean previs).

### B-M12: The rotate gizmo turns objects opposite to the drag direction (line 3390; also 3368-3396)
- **Defect:** the signed angle (3368-3371) is positive for a counter-clockwise drag about the ring axis (right-handed, the same convention as three). The code subtracts it from every channel (3377, 3380, 3383, 3390, 3396).
- **Fix:** add the angle instead of subtracting it, or replace the gizmo with `TransformControls`.

### B-M13: Pilot WASD vertical movement is inverted relative to the look direction (line 3572)
- **Defect:** the true forward vector under YXZ (tilt, pan), as used by `enterPilotView` at 3519-3521, has `y = +sin(tilt)`. `handlePilotKeyboard` uses `−sin(tilt)`. Looking up and pressing W moves the camera down.
- **Fix:** derive the direction from the camera quaternion (`getWorldDirection`).

### B-M14: Orbiting with a gizmo mode active deselects the current object (line 3472)
- **Defect:** picking runs on mousedown (4439-4448). Any press that misses the gizmo goes to `handleViewportClick`, which deselects on a miss (3471-3473). This includes the start of an orbit drag on empty space or the wall, and right-clicks, because there is no `e.button` filter (3821-3825).
- **Fix:** select on pointerup only when pointer travel is under about 4 px. Feat 2: section selection will need the same rule.

### B-M15: Safe-distance floor quads overlap on concave walls and leave wedge gaps on convex walls (line 2676)
- **Defect:** each column's quad offsets both of its edge points along that column's own normal (2668-2683), so neighbouring quads do not share outer vertices.
  - On concave walls the quads overlap in wedges of about D²θ/2. Overlaps double-blend, because the material is transparent with `depthWrite: false` (2717-2723).
  - On convex walls wedge-shaped gaps appear.
  - When the curvature radius R < D, the quads self-intersect. Example: 0.5 m panels at 30° give R ≈ 0.966 m, against D ≈ 2.19 m.
- **Outline:** the red line uses `safeLeft[0]` plus the `safeRight` points only, so it does not trace the quads.
- **Fix:** average the normals into mitred offsets per section, and clamp the band inside the curvature radius.

### B-M16: Panel-mode panel-ID textures are sized per panel with no global budget (line 2003)
- **Defect:** `scale = max(4, min(16, floor(4096/max(ledX, ledY))))` is applied per panel, so realistic panel resolutions get large canvases. A 176×176 panel (500 mm at 2.8 mm pitch) becomes a 2816² canvas: about 32 MB of canvas plus about 42 MB of mipmapped GPU memory, per panel.
- **Impact:** the default 5×3 wall at that resolution already needs about 1 GB. This compounds B-H5.
- **Review disagreement:** rated medium in the textures review and low in three others. The others focused on the canvas-limit angle, which is B-L4.
- **Fix:** render one section atlas and give each panel UVs into it, or apply a total-pixel budget.

---

## Low

### B-L1: The curve step is applied before the first panel (line 1508; copies at 2636-2643, 5028-5035)
- **Behaviour:** panel k has heading `(k+1)·c`, so a curved first section starts rotated by c relative to X. A 1-column section with a 10° curve renders as one panel rotated 10°.
- **Correction:** adjacent panels are always exactly c apart, so the wall is not asymmetric as originally reported. This is a convention quirk.
- **Fix:** decide the convention explicitly before implementing the pivot and offsets. Changing it alters every curved export. Feat 3.

### B-L2: The orbit target, camera reset and safe-distance D assume a flat wall along +X (line 3763; also 2559, 2598-2612)
- **Defect:** these sites use Σ cols·width / 2 and z = 0 as the wall centre.
  - 10×500 mm at 18° really spans x ∈ [−0.50, 1.33] and z ∈ [0, 3.16], yet the target and reset X are 2.5.
  - 5×500 mm at 10° ends at (2.10, 1.21), yet the target is (1.25, 0.75, 0).
- **Note:** the safe-distance *geometry* follows the real layout. Only the scalar D uses the flat bounds.
- **Fix:** use `WallLayout.bounds` or the pivot. Feat 3.

### B-L3: Per-vertex normals are not averaged on curved sections (line 1608; duplicate at 1723-1739)
- **Defect:** each vertex takes the normal of the panel to its right, and the last column copies the previous panel.
- **Impact:** interpolated normals are half a curve step off, and the first and last panels are treated inconsistently. This will show in the normals debug view, under lit or HDRI materials, and in exports.
- **Fix:** average adjacent panel normals at shared columns, or split vertices per panel for flat shading. Feat 1, 5.

### B-L4: There is no canvas-size guard for panel-ID canvases and exports (lines 1687, 2056, 4931, 4538)
- **Defect:** the combined atlas and section canvases use `scale ≥ 1`. `ledX`/`ledY` have no maximum (3951-3952, 4034); the cap was removed deliberately in commit aee55ac.
- **Impact:** past the browser canvas limit (about 32,767 px per side in Chrome; about 16.7 MP area on iOS):
  - `exportPanelIds`' `toBlob` yields null, and `URL.createObjectURL(null)` throws;
  - in `exportZIP`, `toDataURL` returns `data:,`, so a 0-byte PNG is written silently.
- **Not blank in the viewport:** above `MAX_TEXTURE_SIZE`, r128 downsamples with a warning rather than rendering blank.

### B-L5: glTF indices are always Uint16 (line 4788; also 4810)
- **Defect:** combined mode can exceed 65,535 vertices (about 62 or more max-size sections), and the indices would then silently wrap.
- **Latent:** B-H3 fires first today. Use Uint32 (5125) when needed.

### B-L6: Combined-mode OBJ and glTF use only the first section's colour (line 4564; also 4850)
- **Defect:** the viewport combined mesh uses per-section vertex colours (1652-1662), but the exports colour the whole wall with section 0's colour.

### B-L7: The standalone OBJ export references textures it does not deliver (line 4612; also 4915-4916)
- **Defect:** in section mode the MTL `map_Kd` points at textures that are never downloaded.
- **Blocked download:** the .mtl is a second download fired by setTimeout, which Chrome may prompt for or block as a multiple-download attempt.

### B-L8: `importJSON` validates nothing (lines 4975-4992, 4977, 4979, 4989)
These sub-issues need hand-edited or third-party files. The app's own exports round-trip correctly.
- **Empty sections:** `sections: []` is accepted, so `nextSectionId` becomes −Infinity. `addSection` then throws on `last.panelCols` (4088-4093), and combined OBJ/glTF throw on `wallSections[0].color`. Importing a valid file recovers; a reload is not required.
- **No coercion or clamping:** with `"columns": "10"`, `panelCols + 1` becomes `"101"` and the index math is corrupted (1631, 1642, 4592, 4837). Out-of-range values bypass the UI limits; `columns: 100000` can hang the tab.
- **Bad ids:**
  - mixing explicit and missing ids produces duplicates, and `deleteSection` (4133) then removes both sections;
  - a non-numeric id makes `nextSectionId` NaN, and NaN-id sections can never be deleted;
  - logo handlers `parseInt` the id (2260, 2281), so logos never attach to string ids.
- **Unknown `mesh_mode`:** any value is accepted (4992). No mode card is active, and the wall silently renders as panels (1555-1556).
- **Silent failures:** a file without a `sections` array does nothing, and there is no `reader.onerror`.
- **Fix:** add an `io/ProjectValidator`: coerce and clamp to the UI limits, reassign unique ids, require at least one section, and use an enum for the mode.

### B-L9: The `parseFloat(v) || default` idiom rejects legitimate zeros (line 4290; also 4296, 4032, 4279, 4267, 4273, 4030-4036)
- **Defect:** Camera Y = 0, which is the input's `min` (1056), snaps to 1.5. Camera Z = 0 snaps to 5 instead of 0.1.
- **Other fields:** width, focal length and filmback reset to their default rather than their minimum on 0. This is inconsistent but harmless, because 0 is invalid there.
- **Fix:** check with `Number.isFinite`.

### B-L10: The gizmo and pilot mode bypass input validation (line 3340; also 3583, 3589, 3380, 3390, 3396, 3551)
- **Defect:** `posZ` can reach 0 or go negative, which gives negative frame sizes and nonsense status (2477-2481). Camera and prop `rotY` become unbounded.
- **Inconsistent minimum:** posY's minimum is 0 for the gizmo and the input, but 0.1 for pilot mode.
- **Fix:** route every write through a single validated setter.

### B-L11: The shortcut handler ignores SELECT focus, modifier keys and key repeat (line 4411)
- **Defect:** type-ahead in a focused select (`#led-layout`, `#camera-filmback`, the logo position selects) triggers G/R/L/P. The WASD handler at 3845 does skip SELECT.
- **Modifiers:** Ctrl/Cmd+P toggles pilot mode or shows the alert as well as opening the print dialog. Ctrl+G and Ctrl+L also reach the handler.
- **Repeat:** holding P flips pilot mode on and off repeatedly.

### B-L12: Gizmo geometries and materials leak on every rebuild and deselect (line 2999; also 3149-3152)
- **Defect:** the gizmo group is removed from the scene without being disposed. Each rebuild leaks 3-6 geometries and 3 materials. Small, and only on user actions.

### B-L13: The mesh-mode handler fires twice per click (line 4156)
- **Defect:** each `<label class="mesh-mode-option">` wraps a hidden radio (913-927). The synthetic click on the radio bubbles back to the label, so `createLEDWall` runs twice.
- **Fix:** listen for `change` on the radio.

### B-L14: Duplicate section names make ZIP textures overwrite each other (line 4092)
- **Defect:** `addSection` names new sections `Wall ${length+1}`. Starting from three sections, deleting Wall 2 and then adding a section produces a second "Wall 3".
- **Impact:** JSZip replaces entries with the same path (4540-4541), and both JSON `texture_file` entries collide. Names that sanitise to the same string ("A B" and "A_B") collide too.

### B-L15: Integer fields accept fractional values (line 4029)
- **Defect:** values are parsed with `parseFloat` and never rounded, and there is no `step` attribute. The browser flags the value but does not block it.
- **Example:** Columns = 2.5 builds 3 edge columns but only 3 vertices per row while `vertsPerRow` is 3.5. The result is fractional indices, garbage triangles, UVs that stop at 0.8 and fractional stats.
- **Fix:** add `Math.round` and `step="1"`.

### B-L16: The 4K ⚠ title indicator only works for default-named sections (line 4064)
- **Defect:** the indicator is inserted by a regex replace on `/Wall \d+/`. A renamed section gets no ⚠. A name like "Wall 2B" gets it in the middle of the name.

### B-L17: The 4K check ignores the combined canvas (line 3908)
- **Defect:** the check runs per section only. The combined mesh texture and `panel-ids.png` are Σ cols·ledX wide and are never checked.

### B-L18: Combined-mode LED sim ignores section colours (line 1672)
- **Defect:** the material uses a white tile and does not set `vertexColors: true`. Section and panel modes do use `section.color` (1766, 1790).

### B-L19: Panel mode ignores section logos and the section-label size (line 2001)
- **Defect:** `createPanelIdTexture` never reads `sectionLogos` or `sectionLabelFontSize`. The label size is fixed at 0.25 × the panel font size (2041).
- **Impact:** the controls are still shown. ZIP exports do include logos, because they go through the section canvas, so the viewport and the export disagree.

### B-L20: The LED tile cache grows without bound (line 1854)
- **Defect:** one 64×64 entry (about 16 KB, never uploaded) is added per distinct colour seen while the custom colour picker is dragged. The cache is cleared only on the LED-sim toggle or a layout change. Minor.

### B-L21: Import neither resets `sectionLogos` nor re-renders the logo list (line 4976)
- **Defect:** logos keyed by old ids reattach to imported sections that reuse those ids (2116). This happens even on a normal import. With panel IDs on, the logo panel keeps listing the old sections.

### B-L22: The prop gizmo shows handles that do nothing (line 3389)
- **Defect:** for the person and the car, the Y arrow and the X/Z rings are built, highlighted and draggable, but they are ignored.

### B-L23: The local-space gizmo orientation goes stale (line 2466; also 2889-2891, 2980-2982)
- **Defect:** rotation changes from the inputs, pilot mouse-look or reset update only the gizmo position. Later local-axis translates use the stale quaternion (3277-3279, 3330-3332).

### B-L24: The selection badge overlaps the help badge, and the grid button has no active style (line 691)
- **Overlap:** `.selection-indicator` (691-694) and `.viewport-info` (479-483) are both at bottom 20 px / left 20 px.
- **Grid button:** `#toggle-grid` toggles `.active`, but there is no `.view-btn.active` rule.

### B-L25: View preset buttons break the pilot view (line 3865)
- **Defect:** `setView` has no `pilotMode` guard. A preset moves the main camera to an orbit pose that keeps the pilot FOV. The next pilot input snaps it back, and on exit `savedCameraState` overwrites the Reset.

### B-L26: The gizmo stays rendered in pilot mode, centred on the eye (line 3483)
- **Defect:** with the camera selected, the rotate rings (radius 0.455, beyond the 0.1 near plane, depthTest off) draw across the pilot view.

### B-L27: Keyboard movement speed depends on frame rate (line 3884)
- **Defect:** orbit (0.08 per frame) and pilot speeds have no delta time, so movement at 144 Hz is 2.4× faster than at 60 Hz.

### B-L28: World-space camera rotate rings do not rotate about the axes they display (line 3376)
- **Defect:** the red and blue rings write the YXZ Euler pitch and roll. With rotY = 90°, the red (world X) ring rotates the camera about world Z.

### B-L29: Safe-distance floor faces point down (line 2703)
- **Defect:** the order wallLeft, wallRight, safeRight, safeLeft with indices (0,1,2),(0,2,3) gives a −Y face normal.
- **Export impact:** the OBJ has no `vn`, so importers see an upside-down floor. The 0.005 m lift is baked into the exported Y values. This is latent until B-M1 is fixed.

### B-L30: Pose changes rebuild geometry that does not depend on the pose (line 2462)
- **Defect:** the frustum geometry and the whole safe-distance group (including a new canvas and CanvasTexture) are rebuilt on every gizmo mousemove and every pilot frame. Both are uploaded into two contexts.
- **Nature:** objects are disposed correctly, so this is wasted work, not a leak.

### B-L31: The JSON export does not save the state the README promises (line 4942)
- **Defect:** README lines 137-142 promise camera settings, prop positions and "full project state". The export saves only sections, `mesh_mode` and totals.
- **Not saved:** camera, props, panel-ID styling, logos, LED sim and display toggles.

### B-L32: Preview resize clamps can blow out with extreme custom aspect ratios (line 3677)
- **Defect:** the width is recomputed from the clamped height without being clamped again. A 100×1 mm custom filmback gives a 12,000 px wide window, and a 1×100 mm one gives 6 px.

### B-L33: The drawn frustum depth is fixed at 15 m (line 2374)
- **Defect:** past 15 m the frustum stops short of the wall, while the preview camera sees to 100 m. Nothing clips it at the wall, so it also pokes through the wall at close range. Cosmetic.

### B-L34: The preview header loses sensor identity, and the resolution label is made up (line 3732)
- **Header:** `split(' ')[0]` reduces ARRI LF and ARRI Alexa both to "ARRI", the RED presets to "RED", and Full Frame to "Full".
- **Resolution:** `round(1080·aspect)×1080` is not tied to any camera format.

### B-L35: Logo loading has no error handling and no zero-size guard (line 2127; also 2256-2278)
- **Defect:** there is no `img.onerror` or `reader.onerror`. An image that reports 0×0, such as an SVG with only a viewBox in some browsers, makes `imgAspect` NaN, and nothing is drawn.
- **Relevance:** this matters for a Morph SVG logo. Feat 6.

### B-L36: Toggle switches are not keyboard accessible (line 931)
- **Defect:** the 9 `div.toggle` elements (931, 935, 943, 963, 980, 999, 1100, 1111, 1138) have no `tabindex`, `role="switch"`, `aria-checked` or key handling.

---

## Rejected reports

| Report | Line | Why it was rejected |
|---|---|---|
| The LED tile cache key collides for any `THREE.Color` argument (`${color}` gives "[object Object]") | 1808 | Latent only. The only Color-object caller (1672) always passes white, and every other caller passes hex strings, so no wrong tile is ever returned. Normalise the key (`getHexString()`) before fixing B-L18, which will pass coloured Color objects. |
| glTF POSITION min/max are computed from float64 rather than the stored float32 values, which triggers validator mismatch | 4766 | Under the glTF spec, FLOAT min/max are rounded to single precision before comparison, and `fround(declared)` equals the stored value. Not a functional defect; computing from `vertexBuffer` is optional tidiness. |

## Reports confirmed with overstatements corrected (these remain bugs)
- **B-M8 safe-distance overlay:** the claim that it "cannot be removed" is overstated. Re-enabling the preview and toggling it off works.
- **B-L8 empty sections:** the claim that it is "unrecoverable without reload" is overstated. Importing a valid file recovers.
- **B-H5 renderer references:** "textures stay referenced by the renderer" is overstated. A WeakMap holds them, so GC eventually reclaims them.
- **B-L4 oversized canvases:** "blank texture" is wrong for over-`MAX_TEXTURE_SIZE`. r128 downsamples with a warning.
- **B-L1 curve convention:** "asymmetric wall" is wrong. The effect is a global rotation by c at the start of each curved section.
- **B-L2 example extent:** "x ∈ [−0.5, 1.6]" is wrong. The correct range is [−0.5, 1.33].
- **B-L36 toggle count:** "11 toggles" is wrong. There are 9.
- **Missing ledX/ledY maximum:** the cap was removed deliberately in commit aee55ac. The real defect is the missing canvas-size guard, filed as B-L4.

## Observations not separately verified as defects
- `downloadFile` (5082-5091) revokes the object URL synchronously after `click()`. This works in Chrome, but a deferred revoke is safer.
- `<meta author="Joe Loe">` (line 6) is invalid markup. It should be `<meta name="author" content="…">`. There is no favicon.
- JetBrains Mono is drawn at weight 700 on canvases, but only weights 300-600 are loaded. Canvas drawing also does not wait for `document.fonts.load`, so the first render can fall back to a different font.
- `cameraBodyMesh` is not nulled by `removeCameraPreview`. Picking relies on the `cameraPreviewEnabled` guard.
- In pilot mode the main camera keeps the viewport aspect, so its horizontal FOV differs from the preview and the frustum.
- The frustum geometry is built twice on the first enable (2340-2343 and 2458-2459).
