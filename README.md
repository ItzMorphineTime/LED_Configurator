# LED Wall Configurator

A professional-grade, browser-based 3D configurator for designing LED video walls and virtual production stages. No installation required.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-blue?style=for-the-badge)](https://itzmorphinetime.github.io/LED_Configurator/)
![License](https://img.shields.io/badge/license-Apache%202.0-green)

---

## 🚀 Live Demo

**[Launch LED Wall Configurator →](https://itzmorphinetime.github.io/LED_Configurator/)**

No installation required. Works in any modern browser.

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
- Optional floor grid with measurements
- Combined or per-section mesh rendering modes

### Camera Frustum Preview System
- Professional filmback presets (ARRI, RED, Sony, Blackmagic, Full Frame, Super 35, etc.)
- Custom sensor dimensions support
- Adjustable focal length with real-time FOV calculation
- Live camera view window (resizable picture-in-picture)
- Frame coverage visualization at wall distance
- Safe distance calculation and 3D visualization

### 3D Gizmo Controls
- **Translate Mode (G)**: Move objects along X/Y/Z axes
- **Rotate Mode (R)**: Rotate objects around X/Y/Z axes
- **World/Local Space (L)**: Toggle between world and local coordinate systems
- Visual feedback with hover highlighting
- Renders on top of scene for easy interaction

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

### LED Simulation
- Real-time animated LED effect
- Visualizes pixel density and appearance
- Toggle on/off for performance

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
| Escape | Exit pilot mode / Deselect object |

### Pilot Mode Controls
| Control | Action |
|---------|--------|
| Mouse Drag | Look around (pan/tilt) |
| W/A/S/D | Move in look direction |
| Q/E | Move down/up |
| Scroll Wheel | Adjust movement speed |
| Escape | Exit pilot mode |

---

## 📐 Configuration Options

### Wall Section Parameters
| Parameter | Description | Range |
|-----------|-------------|-------|
| Panel Columns | Number of panels horizontally | 1-50 |
| Panel Rows | Number of panels vertically | 1-50 |
| Panel Width | Width in millimeters | 100-2000mm |
| Panel Height | Height in millimeters | 100-2000mm |
| LED X Resolution | Horizontal pixels per panel | 8-512 |
| LED Y Resolution | Vertical pixels per panel | 8-512 |
| Curve Intensity | Curvature angle per panel | -45° to +45° |
| Section Offset | Rotation before section | -180° to +180° |

### Camera Settings
| Parameter | Description |
|-----------|-------------|
| Filmback Preset | Professional camera sensor sizes |
| Sensor Width/Height | Custom sensor dimensions (mm) |
| Focal Length | Lens focal length (8-800mm) |
| Position X/Y/Z | Camera location in meters |
| Tilt/Pan/Roll | Camera rotation in degrees |

---

## 📤 Export Options

### JSON Configuration
Export and import complete wall configurations including:
- All section parameters
- Camera settings
- Scene prop positions
- Full project state

### OBJ Export
Industry-standard 3D mesh format compatible with:
- Blender
- Maya
- Cinema 4D
- Unreal Engine
- Unity

### glTF Export
Modern 3D format with embedded materials for:
- Web viewers
- AR/VR applications
- Real-time engines

### ZIP Package
Complete export bundle containing:
- JSON configuration
- OBJ mesh files
- Panel ID textures (PNG)
- Per-section exports

### Panel IDs PNG
High-resolution texture map showing:
- Panel numbering
- Section identification
- Color-coded borders

### Safe Distance OBJ
Export the calculated safe camera zone as 3D geometry.

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
- **CSS3** - Modern styling with CSS variables

### Browser Support
- Chrome (recommended)
- Firefox
- Safari
- Edge

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

## 📧 Contact

Project Link: [https://github.com/ItzMorphineTime/LED_Configurator](https://github.com/ItzMorphineTime/LED_Configurator)

---

<p align="center">
  <a href="https://itzmorphinetime.github.io/LED_Configurator/">
    <img src="https://img.shields.io/badge/🚀_Launch_Configurator-blue?style=for-the-badge&logo=github" alt="Launch Configurator">
  </a>
</p>
