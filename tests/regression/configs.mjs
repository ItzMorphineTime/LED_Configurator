// Wall configurations imported through #import-input, using the app's JSON schema:
// { version, sections: [{ name, id, panel: { columns, rows, width_mm, height_mm },
//   led_resolution: { x, y }, curvature: { angle_degrees, angle_offset_degrees }, color }], mesh_mode }

const sec = (name, id, cols, rows, w, h, lx, ly, curve, offset, color) => ({
    name, id,
    panel: { columns: cols, rows, width_mm: w, height_mm: h },
    led_resolution: { x: lx, y: ly },
    curvature: { angle_degrees: curve, angle_offset_degrees: offset },
    color,
});

export const CONFIGS = {
    // Three flat sections in a straight line.
    flat3: {
        version: '1.0',
        sections: [
            sec('Left', 0, 4, 3, 500, 500, 64, 64, 0, 0, '#00f0ff'),
            sec('Center', 1, 6, 3, 500, 500, 64, 64, 0, 0, '#ff00aa'),
            sec('Right', 2, 4, 3, 500, 500, 64, 64, 0, 0, '#00ff66'),
        ],
        mesh_mode: 'combined',
    },

    // Concave curved sections with positive and negative section offsets.
    // Also exercises import defaults: one section has no name/color, one has no id.
    concave_offsets: {
        version: '1.0',
        sections: [
            sec('Curve A', 3, 6, 4, 500, 500, 48, 48, 5, 0, '#ffdd00'),
            { id: 7, panel: { columns: 5, rows: 4, width_mm: 500, height_mm: 500 }, led_resolution: { x: 48, y: 48 }, curvature: { angle_degrees: 3.5, angle_offset_degrees: 15 } },
            { name: 'Curve C', panel: { columns: 4, rows: 4, width_mm: 500, height_mm: 500 }, led_resolution: { x: 48, y: 48 }, curvature: { angle_degrees: 7.5, angle_offset_degrees: -20 }, color: '#aa66ff' },
        ],
        mesh_mode: 'section',
    },

    // A single convex (negative curve) section; imported in 'panel' mesh mode.
    convex: {
        version: '1.0',
        sections: [
            sec('Convex Drum', 0, 8, 4, 500, 500, 64, 64, -4, 0, '#ff6b35'),
        ],
        mesh_mode: 'panel',
    },

    // Mixed panel sizes, mixed LED resolutions and different row counts (different heights).
    mixed: {
        version: '1.0',
        sections: [
            sec('Main 500', 10, 5, 3, 500, 500, 64, 64, 0, 0, '#00f0ff'),
            sec('Tall 600x337.5', 11, 3, 5, 600, 337.5, 96, 54, 2.5, 10, '#ff00aa'),
            sec('Wide 1000x500', 12, 4, 2, 1000, 500, 128, 64, -1.5, -5, '#ffffff'),
            sec('Small 250', 13, 6, 6, 250, 250, 32, 32, 0, 30, '#66ffaa'),
        ],
        mesh_mode: 'combined',
    },

    // Box / corner layout built from 90-degree section offsets.
    box_corner: {
        version: '1.0',
        sections: [
            sec('Back', 0, 6, 3, 500, 500, 64, 64, 0, 0, '#00f0ff'),
            sec('Side Right', 1, 4, 3, 500, 500, 64, 64, 0, 90, '#ff00aa'),
            sec('Front', 2, 6, 3, 500, 500, 64, 64, 0, 90, '#00ff66'),
            sec('Return', 3, 2, 3, 500, 500, 64, 64, 0, -90, '#ff6b35'),
        ],
        mesh_mode: 'combined',
    },

    // Stress case: 3,200 panels (probes export limits, e.g. very large glTF buffers).
    large_wall: {
        version: '1.0',
        sections: [
            sec('L1', 0, 40, 20, 500, 500, 32, 32, 0, 0, '#00f0ff'),
            sec('L2', 1, 40, 20, 500, 500, 32, 32, 1, 0, '#ff00aa'),
            sec('L3', 2, 40, 20, 500, 500, 32, 32, 0, 0, '#00ff66'),
            sec('L4', 3, 40, 20, 500, 500, 32, 32, -1, 0, '#ff6b35'),
        ],
        mesh_mode: 'combined',
    },
};
