// The Phase-1 values of the Theme colour leaves that theme/ThemeBridge.js lists in UNBRANDED (index.html@cd3fd3f,
// the line numbers of ARCHITECTURE 3.4), frozen, for the U11 test of docs/improvements/06-morph-branding.md 8.1
// (AC 10: functional conventions are never re-coloured). Adding a path to UNBRANDED needs its Phase-1 value here.
// Not a test file (the unit glob runs *.test.mjs only).

export const LEGACY_UNBRANDED = Object.freeze({
  'scene.lights.ambient.color': 0xffffff,                                     // 1440
  'scene.lights.point.color': 0xffffff,                                       // 1441
  'scene.person.body': 0x4488ff,                                              // 2840
  'scene.person.dark': 0x2244aa,                                              // 2841
  'scene.car.body.color': 0xff4444,                                           // 2915
  'scene.car.dark.color': 0x222222,                                           // 2916
  'scene.car.glass.color': 0x88ccff,                                          // 2917
  'scene.car.lights': 0xffffaa,                                               // 2960
  'scene.gizmo.x': 0xff4444,                                                  // 3029-3089
  'scene.gizmo.y': 0x44ff44,
  'scene.gizmo.z': 0x4444ff,
  'canvas.panelBorderColors': Object.freeze(['#ff0000', '#00ff00', '#0000ff']),   // 1384
});

/** Spec 01's face-orientation convention colours (01 4.6, CR-8; 06 D12): bound to tokens, never re-coloured. */
export const FACE_ORIENTATION = Object.freeze({ 'scene.debug.faceFront': 0x2f6bff, 'scene.debug.faceBack': 0xff3344 });
