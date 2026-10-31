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

## 🌐 Deploying to GitHub Pages

The workflow `.github/workflows/pages.yml` publishes the app on every push to `main` or
`refactor/modular-architecture`, and can also be run by hand from the **Actions** tab ("Deploy Pages" → *Run workflow*).
It copies only the runtime files (`index.html`, `css/`, `js/`, `assets/`); there is no build step.

One-time setup:
1. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
2. If you deploy from a branch other than the default branch, allow it under
   **Settings → Environments → github-pages → Deployment branches and tags** (by default only the default branch may deploy).
3. Push, then open the URL shown in the workflow run (for this repository: https://itzmorphinetime.github.io/LED_Configurator/).

Separately, `.github/workflows/ci.yml` runs the static checks and unit tests on every push and pull request.

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

Release note: the camera's frustum in the 3D view now ends where its rays meet the wall (it used to run 15 m, straight
through the wall); a corner that misses the wall ends at the distance of the wall plane in front of the camera.

Release note: the frame status now looks where the camera looks. It used to measure the frame straight ahead along Z
against a flat rectangle, whatever the pan, tilt and roll and the shape of the wall; now it traces the four frame
corners and the optical axis against the real wall, so a turned camera shows the frame size on the wall it is aimed at,
and a camera aimed past the wall, or at its back, shows "Not aimed at wall" (with "—" for the distance and the frame
size when no wall lies ahead). "Distance to wall plane" is the distance along the camera's optical axis.

Release note: Reset Camera Position now puts the camera 5 m in front of the wall, facing it and looking at its centre,
whatever the wall's curve, section offsets or direction (it used to stand at Z = 5 facing -Z, which on a curved or
turned wall could be beside or behind it), and the 3D view orbits around the centre of the real wall. "Max Distance" and
the frame status measure the wall as seen face-on (a wall along Z or at 45 degrees gets the same value as one along X;
a strongly curved wall is narrower than the sum of its panels). Z Position has no minimum any more: 0 and negative values
are kept, as the gizmo and pilot mode always allowed.

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
- Choose where the exported wall's origin (its pivot) sits: **Bottom-left corner** (how earlier versions exported),
  **Wall mesh centre on floor** (the centre of the wall's bounding box, at floor level) or **Wall centre on floor**
  (halfway between the first section's first edge and the last section's last edge, at floor level; the default)
- **Orientation**: turn the whole wall about the pivot. **Centre on +X (LED faces −X)** (the default) turns it so the
  wall's centre lies on the +X side and the LED face at the wall's centre looks along −X, back toward the origin;
  **Centre on −X (LED faces +X)** is the mirror image; a **Yaw offset** (degrees, −180 to 180) adds to either, or turns
  the wall on its own with **None**
- Move the pivot further with a metre offset on X, Y and Z (1 mm steps, up to ±1000 m), by typing it or by dragging the
  pivot marker in the viewport (press **O** or "Select pivot (O)"; hold Ctrl or ⌘ to drag in steps of the "Ctrl-drag
  snap" size; Escape cancels a drag)
- Every OBJ, glTF and ZIP export is written with the pivot as the file origin; the viewport's grid and axes sit on the
  pivot projected onto the floor
- **Keep stage layout on pivot change** moves (and turns) the camera and props with the wall when you change the pivot
  or the orientation, so their placement relative to the wall is kept; turn it off to keep their coordinates instead
- "Distance to wall plane" in the camera panel shows the distance along the camera's optical axis to the wall plane it is
  aimed at

Release note: the pivot marker (a small cross at the pivot, with a dashed line to the floor when the pivot is raised and
a grey cross at the anchor when an offset is set) is shown by default; "Show pivot marker" hides it. It never appears in
the camera preview window or in pilot mode.

Release note: the floor grid now covers 100 m x 100 m with lines on whole metres and is centred on the stage origin (the
pivot on the floor), where the red, green and blue axes cross; it used to be 50 m x 50 m, offset in front of the wall,
with lines on half metres.

Release note: new projects now start with the **Wall centre on floor** pivot, **Centre on +X (LED faces −X)**
orientation and **Individual Section Meshes**; the **Mesh Options** and **Wall Pivot** cards start collapsed (click the
title, or focus it and press Enter or Space, to open them). The person and car props of a new project now stand in front
of the LED face (2 m and 3.5 m out, to the right of the camera's axis).

Release note: the pivot is new. It lasts for the session only: Export JSON does not save it (or the orientation) yet,
and importing a project file keeps the session's pivot and orientation (a file's mesh mode still applies). The camera's "Z Distance from Wall" field is now "Z Position", because
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
| Side panel handle (chevron on the viewport's left edge; bottom edge on narrow screens) | Hide / show the side panel; hidden, the 3D view takes the whole width (Tab to it, Enter or Space) |
| Left click on a wall section | Select it (outlined and tinted in the 3D view, its card highlighted, "Selected: *name*"); works in every mesh mode, not in pilot mode. A click on empty space or Escape deselects; a drag (4 px or more) only orbits. The camera, person, car and pivot keep their own clicks |
| Right click on a wall section | Select it and open the section menu: **Change settings** (shows the side panel and opens the section's card), **Edit UVs…**, **Deselect**. ↑ / ↓ move, Enter runs, Escape closes |
| Double-click on a wall section | Open the UV viewer on it |

### Gizmo Controls
| Key | Action |
|-----|--------|
| G | Toggle Translate mode (a selected wall section has no gizmo yet) |
| R | Toggle Rotate mode |
| L | Toggle World/Local space |
| P | Toggle Pilot camera mode |
| O | Select / deselect the wall pivot (switches the gizmo to Translate) |
| U | Open / close the UV viewer (see [UVs and the UV editor](#uvs-and-the-uv-editor)) |
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
Export and import whole projects. The JSON project file (`"format": "morph-led-project"`, `"version": "2.0"`) contains:
- All section parameters (name, panels, LED resolution, curvature, angle offset, colour) and each section's logo
- The mesh mode
- The display settings (content: colour, LED simulation or panel IDs; LED layout; wireframe; panel frames; grid; safe
  distance)
- The panel ID styling (border, label font size and colour, section names and their size and colour)
- The camera (preview on or off, filmback, focal length, position and rotation)
- The person and car props (shown or hidden, position, rotation, scale)
- The logo images, once per distinct image, stored in the file itself
- Totals (sections, panels, pixels)

Importing a version 2.0 file restores all of it, including a camera position saved while the preview was off (it is
used when you next turn the preview on). Version 2.0 files keep every key of version 1.0 in the same place, so a tool
that reads version 1.0 files still reads the same wall. Version 1.0 files still import as before: they replace the wall
and the mesh mode only, keep the camera, props, display and styling as they are, and clear the section logos.

Release note: a section name is always shown as plain text. A project file shared by someone else could hide HTML or
script in a section name, which the page used to run on import; such a name is now displayed exactly as written.

Release note: imported files are checked before anything changes. A value the app can repair (a number written as
text, a fractional column count, a value outside its range, an invalid colour, a duplicate section id, an unknown mesh
mode) is corrected, and one message lists every correction. A file that is not a project, has no sections, has more
than 200 sections, was saved by a newer version or is larger than 179 MB is refused with a message, and the current
wall stays as it was. A wall can have at most 200 sections; at the limit the Add Wall Section button is disabled and its
tooltip says why. Importing a file also
clears the section logos (a version 1.0 file has none), so a logo can no longer reappear on an imported section that
happens to reuse an old section id.

Release note: a project file saved by a newer version of the app opens with a message that names the settings this
version cannot use (they are left out; data under `extensions` is kept as it is). A wall too large for the browser's
images, or with more than 20,000 panels, opens with a note that says what will not work. A project's name and notes
(`project`) are kept when a file has them; this version has no field to edit them yet.

Release note: project files now save the camera, the props, the display settings, the panel ID styling and the section
logos (format version 2.0). The pivot and orientation, the UV settings and UV edits are not saved yet; they will be added
to the version 2 format by their own releases. Until the pivot is saved, the camera and prop positions in a file are
measured from the pivot that was active when it was saved, so open the file with the same pivot and orientation (a new
project's defaults, unless you changed them) to see them where you left them.

Release note: logo uploads are checked. PNG, JPEG and WebP images are kept as they are; SVG logos are cleaned (scripts,
embedded web content and links to other files are removed) and get a size when they have none; other image types (GIF,
BMP, AVIF) are converted to PNG. A logo larger than 2 MB, an image that cannot be read, or a 65th different logo image in
one project is refused with a message. Logos in an imported project file go through the same checks, and a logo that
points to a web address or is not a valid image is left out with a message.

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

### Orientation
The **Orientation** block of the Wall Pivot panel turns the whole wall about the pivot's vertical axis (the floor stays
level; nothing tilts):
- **Alignment: Centre on +X (LED faces −X)** (the default) works out the turn on every change so that the LED face at the
  wall's centre (the middle of the wall's bottom edge, measured along the wall) points along −X. The wall then stands on
  the +X side of the stage origin, facing back toward it, with its sections running left to right as seen from the
  stage: a flat wall lies across the X axis centred on it; a concave wall's middle sits on +X, like a volume wrapped
  around a stage at the origin (the layout of the reference Blender scene the exports are checked against). **Centre on
  −X (LED faces +X)** is the mirror image (the wall's middle on −X, the face looking along +X). **None** leaves the wall
  as it is laid out.
- **Yaw offset** (degrees, −180 to 180, 0.1° steps) adds a turn on top (positive turns counter-clockwise seen from
  above). The read-out under it shows the resulting wall yaw.
- With either alignment, **Reset Camera** (and the first camera preview) puts the camera 5 m in front of the LED face
  along the centre's normal, 1.5 m high, looking at the wall centre; the Front, Side, Top and Reset views turn with the
  wall.
- The offsets X / Y / Z stay in the wall's own axes; dragging the pivot marker moves it along the axes you see.
- Exports are written turned: the OBJ header adds an `# Orientation:` line and the glTF `scenes[0].extras.pivot` an
  `orientation` object whenever the wall is turned.

### What moves in the viewport
The viewport's floor grid and its red, green and blue axes cross at the **stage origin**: the pivot projected onto the
floor. Camera and prop positions (X, Z Position) are measured from there, and the floor is always at height 0. With
**Keep stage layout on pivot change** on (the default), changing the pivot moves the camera and props together with the
wall, so their placement relative to the wall stays the same and only their coordinates change; with it off they keep
their coordinates and the wall moves relative to them. Editing sections never moves the camera or props: with the
centred modes a growing wall stays centred on the stage origin. "Distance to wall plane" in the camera panel is the
distance along the camera's optical axis to the wall plane it is aimed at.

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
The pivot, its offset, the orientation and the "Keep stage layout" and marker switches last for the session: Export JSON
and Export All (ZIP) do not save them yet, and importing a project file keeps the session's pivot and orientation. They
will be added to the JSON v2 project format by their own release (version 2.0 saves the camera, props, display and logos).

---

## UVs and the UV editor

Every section's texture coordinates fill the whole 0–1 UV square by default, in every mesh mode: in **Individual Section
Meshes** each section mesh spans its own texture; in **Single Combined Mesh** each section is its own material slot whose
UVs fill 0–1 (the islands overlap on purpose: every engine maps content per material slot); in **Individual Panels** each
panel takes its part of its section's 0–1 space, so the panels of a section share one texture. Positions and normals
are unchanged.

### UV Mapping options (Mesh Options card)
| Option | Choices | Use |
|---|---|---|
| Combined mesh UVs | **Per-section 0–1** (default, one material per section) / **Atlas, pixel-accurate** (one texture) | Atlas lays the sections side by side exactly like the Panel IDs PNG. For one feed per mesh (nDisplay mesh projection, a disguise screen object) use Atlas, or Individual Section Meshes. |
| Panel UVs | **Section space** (default) / **Per panel 0–1** (legacy) | The legacy option gives every panel its own 0–1 square and its own panel-ID texture; UV edits do not apply to it. |
| glTF: second UV channel (combined canvas, TEXCOORD_1) | **on** (default) / off | Every glTF mesh, in every mesh mode, also gets UV channel 1: all sections side by side in wall order along the bottom of one square canvas, scaled uniformly so pixels stay square (five equal sections fill u 0–0.2, 0.2–0.4, … with v 0–0.2). UV edits carry over; panel meshes use their section-space position. glTF only: OBJ holds one UV set and keeps UV channel 0. |

The note below the options gives the atlas size in LED pixels and the size of the Panel IDs PNG and ZIP atlas
(`png px = LED px × px/LED`), with warnings when the wall is larger than 4K, beyond the GPU texture limit (the Atlas
layout is downscaled in the viewport) or beyond the browser canvas limit (Export Panel IDs and the ZIP atlas are
skipped), and when the viewport section textures were reduced by the 16 MP budget.

### The UV viewer
Open it with **U**, the **UV Viewer** button in the viewport toolbar, **Edit UVs…** on a section card, or a
**double-click on the wall** (it opens on that section). It floats in the viewport: drag its header to move it, drag its
bottom-left corner to resize it, × closes it. On narrow screens (900 px wide or less) it is a sheet along the bottom.

- **Section** picks the section, **Show** the background (Panel IDs, LED pixels, a labelled UV checker, or none), the
  channel select the UVs shown: **UV1 · Section (0–1)** (the section's own UV space, the one you edit), **UV1 · Atlas**
  (read-only, Single Combined Mesh with the Atlas layout) or **UV2 · Combined canvas** (read-only: the glTF second UV
  channel, below), **View** the aspect (Texture: source pixels square; Square (UV): raw UV space; Auto: Texture unless
  the section is longer than 8:1).
- **UV2 · Combined canvas** shows the square canvas of glTF `TEXCOORD_1` (Blender's `UVMap.001`): every section's island
  outlined and named in wall order, the viewed one highlighted with its panel grid, and the Panel IDs atlas in the strip
  it covers (u 0–1, v 0 up to the tallest section's height / the total width). It follows the UV1 edits (transform and
  vertices) and cannot be edited itself; the status line says when the glTF second UV channel is off (UV2 is then not
  exported). OBJ holds UV1 only.
- Wheel zooms about the cursor, middle-drag or Space + drag pans, a double-click on empty canvas (or Home) frames 0–1.
- Hovering the front of the wall or the canvas shows the section, panel, LED, section pixel, atlas LED pixel and the UV
  before and after the transform; the hovered panel is outlined on the wall and a crosshair marks it in the viewer.

### Editing UVs
The island (the outlined quad) is the part of the source image that lands on the section.

| Edit | How |
|---|---|
| Move | Drag inside the island (snaps to whole source pixels; **Alt** free, **Shift** locks the axis), the arrow keys (one source pixel; **Shift**: one panel), or Offset U / V (UV units or source pixels) |
| Scale | Drag a corner (uniform while the link is on; **Shift** inverts it) or an edge handle (one axis); 1 % steps, **Alt** free; or Scale U / V in % (100 % = 1 LED per source pixel) |
| Rotate | Drag the round knob (15° steps, **Shift** 90°, **Alt** free) or type Rotate. The island turns counter-clockwise; the image on the wall turns the other way. |
| Turn feed ⟲ 90 / ⟳ 90 (`[` / `]`) | For processor-rotated feeds: turns the image on the wall 90° and switches Source, so a full island stays full and pixel-exact |
| Source | The pixel size of the feed: W×H or H×W (hidden on square sections) |
| Flip U / Flip V (`H` / `V`) | Mirror the island |
| Reset (`0`), Fit 0–1 (`F`), Pixel-accurate | Identity; the largest undistorted island inside 0–1, centred; 100 % scale, 90° steps and whole-pixel offsets |
| Copy to all | This section's UV transform on every section (a Fit is re-fitted per section) |
| Undo / Redo (↶ ↷, Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y on the canvas) | UV edits only: one step per committed field, button, key or drag |

**Vertices** (the **Edit: Island | Vertices** switch) edits single panel corners: every grid vertex of the section is a
handle. Click selects a vertex, Shift+click toggles one, a drag on empty canvas selects a box (Shift adds), Ctrl/⌘+A
selects all, Escape clears the selection. Dragging a selected vertex moves the whole selection (snaps to whole source
pixels; **Alt** free; **Shift** fine, a tenth of the pointer's travel; Escape cancels); the arrow keys move it one source
pixel (Shift: ten); Vertex U / V set one vertex's position or move several by their centre. **Reset selected** and
**Reset all vertex edits** remove edits; every edit is one undo step. Vertex edits sit under the island transform, so
moving, scaling, rotating or flipping the island, and Reset, Fit 0–1 and Pixel-accurate, keep them. They reach the
viewport, every mesh mode (in Individual Panels a vertex moves the matching corner of every panel sharing it), the OBJ
and glTF exports and the glTF second UV channel, except with **Per panel 0–1** panel UVs. Changing a section's columns
or rows clears its vertex edits (the viewer says so).

Typing in a field previews live; Enter, leaving the field or a spinner click commits it (one undo step); Escape in a
field restores the value it had. Escape during a drag cancels it. Keys typed while the viewer has focus stay in the
viewer (WASD, G, R and the other viewport keys do nothing there); U still closes it, except while typing in a field.
The status line tells whether the section is pixel-accurate or resampled, and when the island leaves 0–1 (edges clamp).

UV edits show on the wall with **Panel IDs** (the status line offers **Show Panel IDs** when the wall shows colours).
**LED Simulation** always shows the physical LED pixels, so it ignores UV edits.

### UVs in the exports
OBJ `vt` and glTF `TEXCOORD_0` carry exactly the UVs of the viewport, UV edits included, in every mesh mode; the panel-ID
textures themselves are never transformed (the UVs pick the part of the source each section shows). In Blender, Maya,
Unity or an Unreal static mesh each section is a material slot with its own 0–1 UVs. For nDisplay mesh projection or a
disguise screen object use the Atlas layout or Individual Section Meshes, so one 0–1 canvas covers the mesh without the
per-section islands repeating the feed.

The glTF (Export glTF, and the glTF inside Export All) also carries a second UV channel, `TEXCOORD_1` (Blender names
the layers `UVMap` and `UVMap.001`), by default: the combined canvas, with every section laid side by side in wall order
along the bottom of one square 0–1 canvas whose side is the wall's total pixel width, so pixels stay square. Section i
covers u from x_i / W to (x_i + w_i) / W and v from 0 to h_i / W, where w_i and h_i are its pixel width and height
(panels × LEDs), x_i the pixel width of the sections before it and W the total width; UV edits are carried into it, and
panel meshes use their place in their section. No material reads it, so use it for one feed across all sections (for
example a camera-mapped or pre-rendered combined plate). OBJ holds a single UV set, so the OBJ export keeps UV channel 0
only. Untick "glTF: second UV channel" to leave it out (for example when an engine's lightmap UV generation targets
channel 1).

### Session only (for now)
UV edits and the UV Mapping options last for the session: Export JSON and Export All (ZIP) do not save them yet, and
importing a project file starts every section from the identity (and clears the UV undo history). They will be saved with
the JSON v2 project format by their own release. The OBJ and glTF exports always carry the current UVs.

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
- `.github/workflows/`: `ci.yml` (static checks and unit tests) and `pages.yml` (the GitHub Pages deployment)
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

6. **Set the pivot and orientation** (optional, Wall Pivot card):
   - The default exports the wall with the file origin on the floor halfway between its two ends, the wall's centre on
     the +X axis and the LED face toward −X (Centre on +X)
   - Choose another pivot mode, an offset or a yaw offset if your pipeline needs it

7. **Export your design**:
   - JSON for configuration backup
   - OBJ (one ZIP with `.obj`, `.mtl` and textures) or glTF for 3D software
   - Export All (ZIP) for the complete package

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
- ✅ Panel IDs and Camera Frustum Preview are collapsible cards too, collapsed at start like Mesh Options and Wall Pivot (click the title, or focus it and press Enter or Space)
- ✅ glTF second UV channel (`TEXCOORD_1`, on by default): every section on one combined canvas in wall order, pixels square, in every mesh mode (OBJ keeps UV channel 0)
- ✅ "Centre on +X (LED faces −X)" alignment, now the default (the wall's centre on +X, facing the origin, like the reference Blender scene); new-project props stand in front of the LED face
- ✅ Whole-wall orientation: "Centre on −X" alignment (the wall's centre on the −X axis, LED face toward +X) plus a yaw offset; camera and props follow the wall with Keep stage layout
- ✅ New defaults for new projects: Individual Section Meshes, Wall centre on floor, Centre on −X; Mesh Options and Wall Pivot are collapsible and start collapsed
- ✅ Camera preview drawn by the main renderer (one WebGL canvas, letterboxed to the filmback, no helpers in the preview); fixes a stale rectangle in the viewport when the preview was enlarged
- ✅ True framing: coverage, frame size and status from the real wall ("Not aimed at wall"), the frustum ends at the wall, Reset and the orbit frame the actual wall
- ✅ Correct normals: stage-facing triangles and per-vertex normals in the viewport, OBJ and glTF; a normals debug view (N, Shift+N) with face-orientation shading
- ✅ Export OBJ downloads one ZIP (`.obj`, `.mtl` and every referenced texture), so materials load in Blender; glTF has UVs (`TEXCOORD_0`) and one material per section
- ✅ Safer imports (names escaped, values validated and clamped), lossless ZIP bundles, working Safe Distance OBJ export, no glTF crash on large walls, clean exit from pilot mode when the preview is turned off
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
