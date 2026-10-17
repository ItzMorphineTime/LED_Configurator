<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/morph-dark-event-lockup.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/brand/morph-primary-horizontal.svg">
    <img src="assets/brand/morph-primary-horizontal.svg" alt="Morph" width="320">
  </picture>
</p>

# Morph LED Configurator

Shape curved and multi-section LED walls and virtual-production stages in the browser, see exactly what the film camera
will frame, and hand the crew the geometry, the panel IDs and the safe zone they build from. Nothing to install.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-C51622?style=for-the-badge)](https://itzmorphinetime.github.io/LED_Configurator/)
![License](https://img.shields.io/badge/code%20license-Apache%202.0-0A0A0A)

---

## 🚀 Live Demo

**[Launch Morph LED Configurator →](https://itzmorphinetime.github.io/LED_Configurator/)**

No installation required. Works in any modern browser.

---

## 💻 Run Locally

The app is plain static files (HTML, CSS and native ES modules; no build step and no `npm install`).
ES modules do not load from `file://`, so opening `index.html` directly no longer works: serve the folder
over HTTP with any local static server and open the printed URL.

```bash
node tools/serve.mjs            # zero-dependency server from this repo: http://127.0.0.1:8000/
# or
python -m http.server 8000      # then open http://localhost:8000/
```

If the browser console reports a MIME-type error for a `.js` file, the server is sending JavaScript as
`text/plain` (some Windows setups do); use `node tools/serve.mjs`, which always serves `.js` as JavaScript.
The hosted version on [GitHub Pages](https://itzmorphinetime.github.io/LED_Configurator/) needs nothing.

---

## ✨ Features

### Multi-Section Wall Design
- Create unlimited wall sections with independent configurations
- Per-section panel dimensions, LED resolution, and colors
- Curved walls (concave/convex) with adjustable intensity
- Section angle offsets for complex configurations (boxes, corners, octagons)
- Renameable sections for organization

### Real-Time 3D Visualization
- Interactive orbit controls (drag to rotate, scroll to zoom)
- WASD + QE keyboard navigation
- Multiple view presets (Front, Side, Top, Reset)
- Optional floor grid with measurements (1 m lines over 100 m x 100 m, centred on the pivot on the floor)
- Combined or per-section mesh rendering modes

### Camera Frustum Preview System
- Professional filmback presets (ARRI, RED, Sony, Blackmagic, Full Frame, Super 35, etc.)
- Custom sensor dimensions support
- Adjustable focal length with real-time FOV calculation
- Live camera view window (resizable picture-in-picture)
- Frame coverage visualization at wall distance
- Safe distance calculation and 3D visualization

Release note: the safe-distance floor is now removed when the camera preview is turned off (it used to stay in the
scene), and it returns when the preview is turned back on with Safe Distance still enabled.

Release note: the live camera view window now shows only what the film camera sees. The floor grid, the axes, the
camera's own frustum (which tinted the whole image orange), the safe-distance floor and the gizmo no longer appear in
it; the main viewport still shows them.

Release note: the live camera view is now drawn by the main 3D view itself, so the page uses a single WebGL canvas. This
removes the cause of a rectangle of the 3D view that could stop updating (black or frozen) after the camera view window
was enlarged: two overlapping WebGL canvases.
The image keeps the filmback's proportions, with black bars instead of a stretched picture, the window has square
corners, and dragging its resize handle with an extreme custom filmback no longer blows the window up beyond
800 x 600 px.

Release note: pilot mode is now a clean camera view: the floor grid, the axes, the camera's own frustum (whose fill tinted
the whole pilot view) and the safe-distance floor are hidden while piloting and come back when you leave it. The
normal lines of the debug view stay visible in pilot mode.

### 3D Gizmo Controls
- **Translate Mode (G)**: Move objects along X/Y/Z axes
- **Rotate Mode (R)**: Rotate objects around X/Y/Z axes
- **World/Local Space (L)**: Toggle between world and local coordinate systems
- Visual feedback with hover highlighting
- Renders on top of scene for easy interaction

### Wall Pivot (export origin)
- Choose where the exported wall's origin (its pivot) sits: **Bottom-left corner** (as before), **Wall mesh centre on
  floor** (the centre of the wall's bounding box, at floor level) or **Wall centre on floor** (halfway between the first
  section's first edge and the last section's last edge, at floor level)
- Move the pivot further with a metre offset on X, Y and Z (1 mm steps, up to ±1000 m), by typing it or by dragging the
  pivot marker in the viewport (press **O** or "Select pivot (O)"; hold Ctrl or ⌘ to drag in steps of the "Ctrl-drag
  snap" size; Escape cancels a drag)
- Every OBJ, glTF and ZIP export is written with the pivot as the file origin; the viewport's grid and axes sit on the
  pivot projected onto the floor
- **Keep stage layout on pivot change** moves the camera and props with the wall when you change the pivot, so their
  placement relative to the wall is kept; turn it off to keep their coordinates instead
- "Distance to wall plane" in the camera panel shows the camera's distance to the wall's start plane

Release note: the pivot marker (a small cross at the pivot, with a dashed line to the floor when the pivot is raised and
a grey cross at the anchor when an offset is set) is shown by default; "Show pivot marker" hides it. It never appears in
the camera preview window or in pilot mode.

Release note: the floor grid now covers 100 m x 100 m with lines on whole metres and is centred on the stage origin (the
pivot on the floor), where the red, green and blue axes cross; it used to be 50 m x 50 m, offset in front of the wall,
with lines on half metres.

Release note: the pivot is new. It lasts for the session only: Export JSON does not save it yet, and importing a
project file resets it to the bottom-left corner. The camera's "Z Distance from Wall" field is now "Z Position", because
it is a stage coordinate measured from the pivot on the floor.

### Pilot Camera Mode
- First-person view through the preview camera
- WASD movement in camera's look direction
- Mouse look for pan/tilt control
- Q/E for vertical movement
- Scroll wheel to adjust movement speed
- Real-time camera position/rotation updates

### Scene Props
- Human figure reference (adjustable position, rotation, scale)
- Vehicle reference prop
- Helps visualize scale and composition

### Panel ID System
- Automatic panel numbering with section prefixes
- Customizable border colors (RGB cycling)
- Adjustable font size and colors
- Section name overlays
- Export panel IDs as PNG texture

Release note: in Combined mode, a wall whose sections have different pixel heights now shows each section's panel IDs
and LED simulation pixel for pixel, exactly as in the Panel IDs PNG; shorter sections used to be stretched to the full
height.

Release note: in Panel mode the panel IDs now show the section logo and the section label size, exactly as in Section
mode, and use one texture per section instead of one per panel, so walls with high-resolution panels no longer use
gigabytes of graphics memory.

### LED Simulation
- Real-time animated LED effect
- Visualizes pixel density and appearance
- Toggle on/off for performance

Release note: in Combined mode the LED simulation now shows each section's colour, as Section and Panel modes always did;
it used to show white LEDs on every section.

---

## 🎮 Controls

### Viewport Navigation
| Control | Action |
|---------|--------|
| Left Mouse Drag | Orbit camera |
| Scroll Wheel | Zoom in/out |
| W / ↑ | Move forward |
| S / ↓ | Move backward |
| A / ← | Move left |
| D / → | Move right |
| Q | Move down |
| E | Move up |

### Gizmo Controls
| Key | Action |
|-----|--------|
| G | Toggle Translate mode |
| R | Toggle Rotate mode |
| L | Toggle World/Local space |
| P | Toggle Pilot camera mode |
| O | Select / deselect the wall pivot (switches the gizmo to Translate) |
| Escape | Cancel a pivot drag / Exit pilot mode / Deselect object |

### Pilot Mode Controls
| Control | Action |
|---------|--------|
| Mouse Drag | Look around (pan/tilt) |
| W/A/S/D | Move in look direction |
| Q/E | Move down/up |
| Scroll Wheel | Adjust movement speed |
| Escape | Exit pilot mode |

Release note: turning the camera preview off while in pilot mode used to leave the viewport stuck in pilot mode, with
P, Escape and the pilot button only repeating an alert; it now leaves pilot mode and restores the orbit view.

---

## 📐 Configuration Options

### Wall Section Parameters
| Parameter | Description | Range |
|-----------|-------------|-------|
| Panel Columns | Number of panels horizontally (whole number) | 1-50 |
| Panel Rows | Number of panels vertically (whole number) | 1-20 |
| Panel Width | Width in millimeters | 50-5000mm |
| Panel Height | Height in millimeters | 50-100,000mm |
| LED X Resolution | Horizontal pixels per panel (whole number) | 8-65,536 |
| LED Y Resolution | Vertical pixels per panel (whole number) | 8-65,536 |
| Curve Intensity | Curvature angle per panel (positive = concave, negative = convex) | -180° to +180° |
| Section Offset | Rotation before section | -180° to +180° |

A value outside its range is clamped to it when the field is changed, and a fractional column, row or LED count is rounded to the nearest whole number. A section whose canvas is larger than 4K shows a warning on its card and a ⚠ next to its name (since this update also for a renamed section). An empty field, or 0 in a field whose default is not 0, falls back to the default (columns and rows 1, width and height 500mm, LED resolution 32).

Release note: columns, rows and LED counts used to accept fractions such as 2.5, which built broken geometry; they are now rounded. Panel height, LED counts and the panel angle gained upper limits (100,000mm, 65,536 and ±180°) far above any real wall, so that every value the app can produce is also accepted when a project file is imported.

### Camera Settings
| Parameter | Description |
|-----------|-------------|
| Filmback Preset | Professional camera sensor sizes |
| Sensor Width/Height | Custom sensor dimensions (mm) |
| Focal Length | Lens focal length (8-800mm) |
| Position X/Y/Z | Camera location in meters, measured from the pivot on the floor (Z Position) |
| Tilt/Pan/Roll | Camera rotation in degrees |

---

## 📤 Export Options

Every download is named after the product: `morph-led-wall.json`, `morph-led-wall-obj.zip` (holding
`morph-led-wall.obj` with `morph-led-wall.mtl` and the textures the MTL uses), `morph-led-wall.gltf`, `morph-led-wall-export.zip`,
`morph-led-wall-panel-ids.png` and `morph-led-wall-safe-distance.obj`. OBJ, MTL and glTF files name "Morph LED Configurator" as their generator.

### JSON Configuration
Export and import wall configurations. The JSON file (format version 1.0) contains:
- All section parameters (name, panels, LED resolution, curvature, angle offset, color)
- The mesh mode
- Totals (sections, panels, pixels)

Release note: a section name is always shown as plain text. A project file shared by someone else could hide HTML or
script in a section name, which the page used to run on import; such a name is now displayed exactly as written.

Release note: imported files are checked before anything changes. A value the app can repair (a number written as
text, a fractional column count, a value outside its range, an invalid colour, a duplicate section id, an unknown mesh
mode) is corrected, and one message lists every correction. A file that is not a project, has no sections, has more
than 200 sections, was saved by a newer version or is larger than 179 MB is refused with a message, and the current
wall stays as it was. A wall can have at most 200 sections; Add Section says so at the limit. Importing a file also
clears the section logos (a version 1.0 file has none), so a logo can no longer reappear on an imported section that
happens to reuse an old section id.

Camera settings, scene props, panel ID styling, section logos and display toggles are not saved yet; they will come with the JSON v2 format.

Release note: the copy of the JSON inside the ZIP package used to leave out the section offsets, so importing it
collapsed box and corner walls into a line. It is now the same document as Export JSON (plus each section's texture
file name) and imports to the same wall.

### OBJ Export
Industry-standard 3D mesh format compatible with:
- Blender
- Maya
- Cinema 4D
- Unreal Engine
- Unity

**Export OBJ (ZIP)** downloads one archive, `morph-led-wall-obj.zip`: the OBJ, its MTL and the panel-ID textures the
MTL uses: in section mode one per section (`textures/<section>_PanelIDs.png`), in combined mode the whole-wall image
(`textures/morph-led-wall-panel-ids.png`, the same image as Export Panel IDs). Unzip it and import the OBJ; the
importer finds the MTL and the textures next to it.

Release note: Export OBJ used to download the OBJ and then, a moment later, the MTL as a second file. Browsers can
block that second download, and in section mode the MTL pointed at textures that were never downloaded, so Blender
imported the walls without their materials. Export OBJ now downloads one ZIP with everything the OBJ needs, and
nothing it references is missing. (A section texture too large for the browser is left out, with its MTL reference,
and a message names it.) The button now reads "Export OBJ (ZIP)".

Release note: the Combined-mode OBJ now carries the same texture coordinates as the viewport: each section maps its own
part of the Panel IDs PNG (the sections used to overlap, each spanning the whole image).

Release note: Combined-mode OBJ and glTF exports now give every section its own material (`Wall_1`, `Wall_2`, ...) in
that section's colour; they used to colour the whole wall with the first section's colour. The wall stays one object
(`LED_Wall_Combined`), with one material slot per section (in glTF, one primitive per section).

### glTF Export
Modern 3D format with embedded materials for:
- Web viewers
- AR/VR applications
- Real-time engines

Release note: the glTF now carries texture coordinates (UV channel 0) on every mesh, so the panel-ID textures, LED
content or a baked projection can be applied in Blender, Unreal or any engine: in Combined mode each section maps its own
part of the Panel IDs PNG (as the OBJ does), in Section mode each section spans its own texture, and in Panel mode each
panel spans 0..1. Positions, normals and materials are unchanged.

### ZIP Package
Complete export bundle containing:
- JSON configuration
- OBJ mesh files
- Panel ID textures (PNG)
- Per-section exports

Release note: in section mode the ZIP's MTL now points each section's material at that section's own texture file
(the name the ZIP stores); it used to use a numbered name, so a renamed section, or every section after a deleted
one, opened in Blender or Unreal without its texture.

Release note: the ZIP now also holds the whole-wall panel-ID image, `textures/morph-led-wall-panel-ids.png` (the same
image as Export Panel IDs). In Combined mode every section material of the MTL uses it, so the combined OBJ opens
textured in Blender or Unreal; in Section and Panel mode it ships for reference only. A wall too large for the browser
leaves it out with a message, like an oversize section texture.

Release note: sections with the same name, or with names that only differ in spaces, punctuation or upper and lower
case, now each get their own texture in the ZIP (`Dup_PanelIDs.png`, `Dup_2_PanelIDs.png`, ...); they used to overwrite
each other, so one texture was missing.

### Panel IDs PNG
High-resolution texture map showing:
- Panel numbering
- Section identification
- Color-coded borders

### Safe Distance OBJ
Export the calculated safe camera zone as 3D geometry (`morph-led-wall-safe-distance.obj`).

Release note: this export used to fail without downloading anything; it now downloads the file. The floor faces up (+Y) and carries
normals, so it imports the right way up. On curved and cornered walls the band is one continuous strip with mitred
corners (it used to overlap itself on concave walls and leave gaps on convex ones). Near concave curves and corners the
band is narrower than the safe distance so that it never folds over itself: there its outer edge is drawn amber
instead of red, and the exported file's header says how many of its points were pulled in. Where the bands of
opposite walls of a U-shaped stage overlap, they still overlap (a darker region in the view).

---

## Pivot

The pivot is the point that becomes the origin of every exported mesh. Set it in the **Wall Pivot** panel (under Mesh
Options) so that the wall arrives in Blender, Unreal or any other tool exactly where your stage needs it, with nothing to
re-centre by hand after each change.

### Choosing the pivot
| Mode | Where the pivot sits |
|------|----------------------|
| Bottom-left corner | The first section's first bottom corner (how every earlier version exported) |
| Wall mesh centre on floor (bounding box) | The centre of the wall's bounding box seen from above, on the floor (use Offset Y to raise it, for example to half the wall height) |
| Wall centre on floor (first ↔ last edge) | Halfway between the first section's first edge and the last section's last edge, on the floor |

- **Offset X / Y / Z** (metres, 1 mm steps, up to ±1000 m) moves the pivot from that anchor in the wall's axes: X along
  the start of the wall, Y up, Z toward the stage. Use it for a surveyed point, for example the tracking origin 2 m in
  front of the wall centre (Wall centre on floor, Offset Z = 2). Typing text or clearing a field keeps the stored value;
  0 is a valid offset. **Reset offset** returns to the anchor.
- **Select pivot (O)**, or the **O** key, selects the pivot marker; drag its arrows to move it (Translate only). Hold
  Ctrl (⌘ on a Mac) while dragging to move in steps of the **Ctrl-drag snap** size; Escape during a drag cancels it and
  leaves the offset unchanged; a second Escape deselects.
- The read-out shows the pivot measured from the wall start, and the line under it what the last change did ("Stage
  origin moved …", "Pivot height … · affects exports only", or a wall edit that moved the stage origin).
- The **marker** (a small cross at the pivot, a dashed line to the floor when the pivot is raised, a grey cross at the
  anchor when an offset is set) is shown in the viewport only: never in the camera preview, never in pilot mode and
  never in an export. "Show pivot marker" hides it.

### What moves in the viewport
The viewport's floor grid and its red, green and blue axes cross at the **stage origin**: the pivot projected onto the
floor. Camera and prop positions (X, Z Position) are measured from there, and the floor is always at height 0. With
**Keep stage layout on pivot change** on (the default), changing the pivot moves the camera and props together with the
wall, so their placement relative to the wall stays the same and only their coordinates change; with it off they keep
their coordinates and the wall moves relative to them. Editing sections never moves the camera or props: with the
centred modes a growing wall stays centred on the stage origin. "Distance to wall plane" in the camera panel is the
camera's distance to the wall's start plane.

### Exports and placement in a 3D tool
- **OBJ, glTF and the ZIP** are written with the pivot at the file origin (0, 0, 0): Y up, metres. The wall's position
  relative to the pivot is exactly what the viewport shows.
- With a pivot other than the bottom-left corner, the OBJ header names it (`# Pivot: …` and `# Stage placement: origin
  at stage (0 <height> 0)`) and the glTF carries it in `scenes[0].extras.pivot` (Blender shows it as a custom property
  of the scene).
- **Blender**: import the glTF (File > Import > glTF 2.0) or the OBJ with its default axes (Y up). Blender converts Y up
  to its Z up, so the pivot lands on Blender's world origin; 1 m stays 1 Blender unit.
- **Unreal Engine** (nDisplay and other virtual-production stages) is Z up and measures in centimetres: the exported Y
  (up) axis becomes Unreal's Z. The glTF importer applies both conversions; for the OBJ, check the import's axis
  conversion and uniform scale (100 turns metres into centimetres). Place the imported mesh at your stage origin with no
  rotation, for example at the root of the nDisplay configuration when the pivot is the tracking origin.
- **A raised pivot** (an Offset Y): the exported wall's floor is below the file origin by the pivot height, which the
  OBJ header's `Stage placement` line states. Place the asset that much above your stage floor to stand the wall on the
  floor; a floor-level pivot (every mode with Offset Y = 0) needs no height.

### Session only (for now)
The pivot, its offset and the "Keep stage layout" and marker switches last for the session: Export JSON and Export All
(ZIP) do not save them yet, and importing a project file resets the pivot to the bottom-left corner. They will be saved
with the JSON v2 project format.

---

## 🏗️ Use Cases

### Virtual Production
- Design LED volumes for in-camera VFX
- Calculate optimal camera positions
- Verify frustum coverage
- Plan stage layouts

### Broadcast Studios
- Configure video walls for news sets
- Plan control room displays
- Design sports broadcast environments

### Live Events
- Concert stage LED configurations
- Corporate event displays
- Trade show installations

### Architectural Visualization
- Digital signage planning
- Retail display design
- Museum/exhibition installations

---

## 🛠️ Technical Details

### Built With
- **Three.js** (r128) - 3D rendering
- **JSZip** - ZIP file generation
- **Vanilla JavaScript** - No framework dependencies
- **CSS3** - Modern styling with CSS custom properties (one token file, `css/02-tokens.css`)
- **Montserrat** and **JetBrains Mono** (Google Fonts) - interface and label type

### Project Structure
- `index.html`: page markup; loads three.js r128 and JSZip from cdnjs, the stylesheets in `css/` and the entry module `js/main.js`
- `css/`: the stylesheets `01-reset.css` ... `12-responsive.css`, the feature sheet `css/features/debug-view.css` and `99-utilities.css`, linked in the order of [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 2.1; `02-tokens.css` holds every colour and font token
- `assets/brand/`: the Morph brand files the app and this README show (see [Brand and licence](#brand-and-licence))
- `js/`: native ES modules in layers (`core`, `legacy`, `theme`, `domain`, `geometry`, `io`, `render`, `interaction`, `app`, `ui`); `js/app/App.js` is the composition root
- `tests/`: unit tests (`node --test "tests/unit/**/*.test.mjs"`), static checks (`tests/static/`) and the golden-master regression harness (`tests/regression/`)
- `tools/serve.mjs`: the local static server
- Architecture and module contracts: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); refactor plan, decisions and how to run the checks: [docs/REFACTOR_PLAN.md](docs/REFACTOR_PLAN.md)

### Browser Support
- Chrome 84+ (recommended)
- Firefox 90+
- Safari 15+ (macOS and iOS)
- Edge 84+

The modules use modern JavaScript class syntax (private fields and methods), so older browsers cannot load the app.

### Performance Notes
- Large configurations (many sections, high LED counts) may impact performance
- LED simulation can be disabled for complex scenes
- Panel ID generation uses canvas 2D for texture creation

---

## 📖 Quick Start Guide

1. **Open the configurator**: [Launch App](https://itzmorphinetime.github.io/LED_Configurator/)

2. **Configure your first wall section**:
   - Adjust panel columns/rows
   - Set panel dimensions (mm)
   - Configure LED resolution
   - Add curvature if needed

3. **Add more sections** (optional):
   - Click "Add Section"
   - Use angle offsets for corners/boxes

4. **Set up camera preview**:
   - Enable "Camera Frustum Preview"
   - Select your camera/filmback preset
   - Adjust focal length
   - Position the camera

5. **Use gizmos for precise control**:
   - Press G for translate mode
   - Click camera/props to select
   - Drag axes to move

6. **Export your design**:
   - JSON for configuration backup
   - OBJ/glTF for 3D software
   - ZIP for complete package

---

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Ideas for Contributions
- Additional camera presets
- New export formats
- Performance optimizations
- UI/UX improvements
- Documentation

---

## 📋 Changelog

### Latest Updates
- ✅ Wall pivot: export origin at the bottom-left corner, the wall mesh centre on the floor or the wall centre on the floor, plus an offset; draggable pivot marker (O); camera and props kept in place; floor grid centred on the pivot (session only for now)
- ✅ Morph branding: dark interface, Morph colours on the 3D scene and the panel-ID textures, the Morph section palette, exports named `morph-led-wall-*`
- ✅ 3D Gizmo system for camera and prop manipulation
- ✅ World/Local space toggle for gizmos
- ✅ Pilot camera mode with WASD navigation
- ✅ Improved gizmo visibility (always on top, hover effects)
- ✅ Section angle offsets for complex wall shapes
- ✅ Negative curvature orientation fixes
- ✅ Safe distance 3D visualization
- ✅ Camera frustum preview system
- ✅ Live camera view window
- ✅ Panel ID export system
- ✅ Multi-section support
- ✅ JSON import/export


## 🙏 Acknowledgments

- [Three.js](https://threejs.org/) for the incredible 3D library
- [JSZip](https://stuk.github.io/jszip/) for ZIP file generation
- The virtual production community for inspiration

---

## Brand and licence

The source code is licensed under the [Apache License 2.0](LICENSE).

The Morph name, the M monogram, the MORPH wordmark and the other artwork in [`assets/brand/`](assets/brand/) are
trademarks of Morph. They are **not** covered by the Apache License 2.0; see
[`assets/brand/NOTICE.md`](assets/brand/NOTICE.md). Do not alter, recolour or redraw them. If you fork this repository,
remove that folder and every reference to it and rename the product, unless Morph has given you permission to use the
marks.

---

## 📧 Contact

Project Link: [https://github.com/ItzMorphineTime/LED_Configurator](https://github.com/ItzMorphineTime/LED_Configurator)

---

<p align="center">
  <a href="https://itzmorphinetime.github.io/LED_Configurator/">
    <img src="https://img.shields.io/badge/Launch_Morph_LED_Configurator-C51622?style=for-the-badge&logo=github" alt="Launch Morph LED Configurator">
  </a>
</p>
