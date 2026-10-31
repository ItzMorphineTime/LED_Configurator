/**
 * @module domain/CineCamera
 * The simulated film camera (legacy `cameraSettings` + `cameraPreviewEnabled`): filmback, lens and pose with the
 * legacy field names, the filmback presets, the lens and safe-distance maths, the input field rules and the
 * gizmo/pilot pose arithmetic. Angles are degrees; the Euler order used by the views is 'YXZ' (tilt = rotX, pan = rotY,
 * roll = rotZ). Feature 3 (03 T1, 4.1): the pose LIMITS, the pivot re-expression translateStage and the posZ input
 * rule's wall-plane context. The coverage (legacy 2471-2534) moved to geometry/FrustumCoverage in 08 P2-11a (B-M10).
 * Legacy source: index.html@cd3fd3f 1299, 1306-1331 (state), 2550-2564 (reset),
 * 2597-2612 (safe distance D), 3337-3340 / 3375-3384 (gizmo), 3544-3552 / 3564-3611 (pilot),
 * 3732 (preset short name), 4251-4317 (inputs).
 * Layer: domain (may import legacy; THREE-free and DOM-free).
 */

import { clamp, deepFreeze, finiteOr, quarterExactTrig, STAGE_POSITION_LIMIT_M, wrapDeg } from './rules.js';

/**
 * Filmback presets (width x height in mm), keyed by the #camera-filmback option values. Deep-frozen.
 * Ports: index.html@cd3fd3f lines 1306-1318.
 * @type {Readonly<Record<string, Readonly<{name: string, width: number, height: number}>>>}
 */
export const FILMBACK_PRESETS = Object.freeze({
  'full-frame': Object.freeze({ name: 'Full Frame (36×24mm)', width: 36, height: 24 }),
  'super35': Object.freeze({ name: 'Super 35 (24.89×18.66mm)', width: 24.89, height: 18.66 }),
  'arri-lf': Object.freeze({ name: 'ARRI LF (36.70×25.54mm)', width: 36.70, height: 25.54 }),
  'arri-alexa': Object.freeze({ name: 'ARRI Alexa (28.17×18.13mm)', width: 28.17, height: 18.13 }),
  'red-v-raptor': Object.freeze({ name: 'RED V-RAPTOR (40.96×21.60mm)', width: 40.96, height: 21.60 }),
  'red-komodo': Object.freeze({ name: 'RED KOMODO (27.03×14.26mm)', width: 27.03, height: 14.26 }),
  'sony-venice': Object.freeze({ name: 'Sony VENICE (36×24mm)', width: 36, height: 24 }),
  'bmpcc-6k': Object.freeze({ name: 'BMPCC 6K (23.10×12.99mm)', width: 23.10, height: 12.99 }),
  'aps-c': Object.freeze({ name: 'APS-C (23.6×15.6mm)', width: 23.6, height: 15.6 }),
  'mft': Object.freeze({ name: 'Micro 4/3 (17.3×13mm)', width: 17.3, height: 13 }),
  'custom': Object.freeze({ name: 'Custom', width: 36, height: 24 }),
});

/**
 * @typedef {object} FieldRule
 * @property {(raw: string, ctx?: FieldContext) => number} parse  the legacy input expression (only posZ reads ctx)
 * @property {boolean} writeBack              whether legacy assigned the parsed value back to the input
 */

/**
 * The context of a camera input rule (03 4.1): wallZ is the stage z of the wall's start plane (`framingBounds().wallZ`,
 * the negated stage-origin z; 0 at the identity pivot and for every pivot whose stage origin lies on that plane);
 * frontZ (03 12.5, optional) is `framingBounds().frontZ`, the z 5 m in front of the LED face (wallZ + 5 for an unturned
 * wall, the Reset position's z for a turned one): when present it is the posZ fallback.
 * @typedef {{wallZ: number, frontZ?: number}} FieldContext
 */

/** The context of the legacy rules: the wall plane at stage z = 0. */
const WALL_PLANE_AT_ORIGIN = Object.freeze({ wallZ: 0 });

/** Rounds to 1 mm: the posZ fallback of a stage origin off the wall's start plane (03 4.1). */
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * The film camera: legacy `cameraSettings` field names plus the preview flag, with the lens, safe-distance and
 * pose arithmetic. Written only through its methods (ARCHITECTURE.md section 4).
 */
export class CineCamera {
  /** legacy `cameraPreviewEnabled` */
  enabled = false;
  filmback = 'full-frame';
  filmbackWidth = 36;
  filmbackHeight = 24;
  focalLength = 35;
  posX = 0;
  posY = 1.5; // meters from ground
  posZ = 5;   // meters from wall
  rotX = 0;   // tilt (degrees)
  rotY = 0;   // pan (degrees)
  rotZ = 0;   // roll (degrees)

  /**
   * Lens and pose input rules. writeBack mirrors whether legacy assigned `this.value` afterwards (posX has none).
   * Since 08 P2-8b (B-L9 fixed) every fallback is finiteOr: 0 is kept and then clamped (posY '0' gives 0, a 0 focal length
   * the minimum 8); only a non-numeric entry takes the default.
   * posZ takes the FieldContext (03 4.1): since 08 P2-11c (Q13, step F; B-L10's Z half) it has no minimum: any finite
   * value is kept (0 and negative values included: curved, turned and box walls have stage space at any Z, and the
   * coverage reports a camera at or behind the wall as 'Not aimed at wall'), and a non-numeric entry gives
   * r3(ctx.wallZ + 5), 5 m in front of the wall's start plane (5 at the identity). The other rules ignore ctx.
   * Ports: index.html@cd3fd3f lines 4266-4317.
   * @type {Readonly<Record<string, Readonly<FieldRule>>>}
   */
  static FIELD_RULES = Object.freeze({
    filmbackWidth: Object.freeze({ parse: (r) => Math.max(1, Math.min(100, finiteOr(parseFloat(r), 36))), writeBack: true }),
    filmbackHeight: Object.freeze({ parse: (r) => Math.max(1, Math.min(100, finiteOr(parseFloat(r), 24))), writeBack: true }),
    focalLength: Object.freeze({ parse: (r) => Math.max(8, Math.min(800, finiteOr(parseFloat(r), 35))), writeBack: true }),
    posX: Object.freeze({ parse: (r) => finiteOr(parseFloat(r), 0), writeBack: false }),
    posY: Object.freeze({ parse: (r) => Math.max(0, finiteOr(parseFloat(r), 1.5)), writeBack: true }),
    posZ: Object.freeze({
      parse: (r, ctx = WALL_PLANE_AT_ORIGIN) => finiteOr(parseFloat(r), r3(ctx.frontZ ?? ctx.wallZ + 5)),
      writeBack: true,
    }),
    rotX: Object.freeze({ parse: (r) => Math.max(-90, Math.min(90, finiteOr(parseFloat(r), 0))), writeBack: true }),
    rotY: Object.freeze({ parse: (r) => Math.max(-180, Math.min(360, finiteOr(parseFloat(r), 0))), writeBack: true }),
    rotZ: Object.freeze({ parse: (r) => Math.max(-180, Math.min(180, finiteOr(parseFloat(r), 0))), writeBack: true }),
  });

  /** How far in front of the wall Reset puts the camera (metres; the legacy 5; 08 P2-11c). */
  static RESET_DISTANCE_M = 5;

  /** The eye height of the aligned Reset (metres; 03 12.7). */
  static RESET_EYE_HEIGHT_M = 1.5;

  /**
   * The writer bounds of the pose (spec 07 C22 and 4.3: x and z within +-100,000 m, y in [0, 100,000]), shared with the
   * validator ranges; since 03 T1 translateStage clamps through them (07 C45), and since 08 P2-13e every other position
   * writer too (setField, translateBy, pilotFly, assign), so the v2 validator never alters a pose the app wrote. They
   * are not the input rules (the posZ rule has no minimum since 08 P2-11c).
   * @type {Readonly<{posX: {min: number, max: number}, posY: {min: number, max: number},
   *                  posZ: {min: number, max: number}}>}
   */
  static LIMITS = deepFreeze({
    posX: { min: -STAGE_POSITION_LIMIT_M, max: STAGE_POSITION_LIMIT_M },
    posY: { min: 0, max: STAGE_POSITION_LIMIT_M },
    posZ: { min: -STAGE_POSITION_LIMIT_M, max: STAGE_POSITION_LIMIT_M },
  });

  /**
   * Stores the parsed value of a lens/pose input (model only; the caller writes back iff FIELD_RULES[field].writeBack).
   * ctx reaches every rule; only posZ reads it (03 4.1). Without ctx the legacy rules apply unchanged.
   * Ports: index.html@cd3fd3f lines 4267, 4273, 4279, 4285, 4290, 4296, 4302, 4308, 4314.
   * Side effects: writes this[field].
   * @param {string} field  a FIELD_RULES key
   * @param {string} raw    the input's value
   * @param {FieldContext} [ctx]  defaults to {wallZ: 0}
   * @returns {number} the stored value
   */
  setField(field, raw, ctx = WALL_PLANE_AT_ORIGIN) {
    const v = CineCamera.FIELD_RULES[field].parse(raw, ctx);
    // 08 P2-13e: the far bounds of the position (no harness value comes near them)
    const bound = Object.prototype.hasOwnProperty.call(CineCamera.LIMITS, field) ? CineCamera.LIMITS[field] : null;
    this[field] = bound ? clamp(v, bound.min, bound.max) : v;
    return this[field];
  }

  /**
   * The setter of validated values (07 4.1; 08 P2-13e, 6.17): the lens and the pose of an imported v2 file, never
   * `enabled`. Only the far bounds of LIMITS apply (never the input rules' minimums); a field that is absent or not a
   * finite number (a string for filmback) is left as it is.
   * Side effects: writes the given fields.
   * @param {{filmback?: string, filmbackWidth?: number, filmbackHeight?: number, focalLength?: number, posX?: number,
   *          posY?: number, posZ?: number, rotX?: number, rotY?: number, rotZ?: number}} fields
   */
  assign(fields) {
    if (typeof fields.filmback === 'string' && Object.prototype.hasOwnProperty.call(FILMBACK_PRESETS, fields.filmback)) {
      this.filmback = fields.filmback;
    }
    for (const key of ['filmbackWidth', 'filmbackHeight', 'focalLength', 'posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ']) {
      const v = fields[key];
      if (!Number.isFinite(v)) continue;
      const bound = Object.prototype.hasOwnProperty.call(CineCamera.LIMITS, key) ? CineCamera.LIMITS[key] : null;
      this[key] = bound ? clamp(v, bound.min, bound.max) : v;
    }
  }

  /**
   * Re-expression after a pivot change (03 6.5): the stage origin moved by -(dx, dz), so the camera keeps its place
   * relative to the wall. Each component is clamped through LIMITS (07 C45), so every value written is reachable and a
   * validator never clamps it on reload; the bound is far beyond any pivot shift, so in practice nothing is clamped.
   * Y and the rotations are untouched (the stage floor and axes do not change).
   * Side effects: writes posX, posZ.
   * @param {number} dx  metres
   * @param {number} dz  metres
   */
  translateStage(dx, dz) {
    const { posX, posZ } = CineCamera.LIMITS;
    this.posX = clamp(this.posX + dx, posX.min, posX.max);
    this.posZ = clamp(this.posZ + dz, posZ.min, posZ.max);
  }

  /**
   * The rigid re-expression of an explicit pivot or orientation edit (03 12.6): with a zero yaw change exactly
   * translateStage(dx, dz); otherwise the position turns about the stage origin by the change (cos, sin), (dx, dz) is
   * added and each component is clamped through LIMITS, and the pan turns with it (wrapDeg(rotY + yawDeg)); y, tilt and
   * roll are untouched ('YXZ': R_y(d) R_y(pan) R_x R_z = R_y(pan + d) R_x R_z).
   * Side effects: writes posX, posZ and maybe rotY.
   * @param {{yawDeg: number, cos: number, sin: number, dx: number, dz: number}} change  WallLayout.stageChange
   */
  reexpressStage({ yawDeg, cos, sin, dx, dz }) {
    if (yawDeg === 0) {
      this.translateStage(dx, dz);
      return;
    }
    const { posX, posZ } = CineCamera.LIMITS;
    const x = this.posX * cos + this.posZ * sin + dx;
    const z = -this.posX * sin + this.posZ * cos + dz;
    this.posX = clamp(x, posX.min, posX.max);
    this.posZ = clamp(z, posZ.min, posZ.max);
    this.rotY = wrapDeg(this.rotY + yawDeg);
  }

  /**
   * Selects a filmback preset; the custom preset keeps the current width and height.
   * Ports: index.html@cd3fd3f lines 4252-4259.
   * Side effects: writes filmback (and filmbackWidth/Height unless 'custom').
   * @param {string} key  a FILMBACK_PRESETS key
   * @returns {{name: string, width: number, height: number}} the preset
   */
  applyPreset(key) {
    const preset = FILMBACK_PRESETS[key];
    this.filmback = key;
    if (key !== 'custom') {
      this.filmbackWidth = preset.width;
      this.filmbackHeight = preset.height;
    }
    return preset;
  }

  /**
   * Horizontal field of view.
   * Ports: index.html@cd3fd3f lines 2365, 2473, 2592 (and 3703 before its degree conversion).
   * Side effects: none.
   * @returns {number} radians: 2 * Math.atan(filmbackWidth / (2 * focalLength))
   */
  hFov() {
    return 2 * Math.atan(this.filmbackWidth / (2 * this.focalLength));
  }

  /**
   * Vertical field of view.
   * Ports: index.html@cd3fd3f lines 2366, 2474, 2593 (and 3704 before its degree conversion).
   * Side effects: none.
   * @returns {number} radians: 2 * Math.atan(filmbackHeight / (2 * focalLength))
   */
  vFov() {
    return 2 * Math.atan(this.filmbackHeight / (2 * this.focalLength));
  }

  /**
   * Ports: index.html@cd3fd3f lines 2371, 3705.
   * Side effects: none.
   * @returns {number} filmbackWidth / filmbackHeight
   */
  aspect() {
    return this.filmbackWidth / this.filmbackHeight;
  }

  /**
   * The largest distance at which the frame still fits the wall in both dimensions: D = min(width / (2·tx),
   * height / (2·ty)). Since 08 P2-11c (B-L2) the size is FramingPolicy's stageExtent (the wall seen face-on, the same
   * measure as the coverage's fits test); it was the flat width sum and the tallest section.
   * Ports: index.html@cd3fd3f lines 2529-2531 (== 2610-2612).
   * Side effects: none.
   * @param {{width: number, height: number}} extent  metres (framingBounds(layout).stageExtent)
   * @returns {number} metres
   */
  maxSafeDistance(extent) {
    const hFov = this.hFov();
    const vFov = this.vFov();
    const maxSafeDistWidth = extent.width / (2 * Math.tan(hFov / 2));
    const maxSafeDistHeight = extent.height / (2 * Math.tan(vFov / 2));
    return Math.min(maxSafeDistWidth, maxSafeDistHeight);
  }

  /**
   * Puts the camera in front of the wall, looking at it (08 6.10, P2-11c; B-L2 fixed; 03 step F): at
   * wallBox.center + 5·facing, level (rotX = rotZ = 0), panned to face back along the wall's facing:
   * rotY = wrapDeg(atan2(facing.x, facing.z)·180/π), so its forward (-sin pan, 0, -cos pan) is -facing. Any Z results
   * (a wall facing -Z puts the camera at negative Z; Q13). For a flat wall along +X this is the legacy (W/2, H/2, 5) with
   * rotY +0, bit for bit.
   * Ports: index.html@cd3fd3f lines 2559-2564.
   * Side effects: writes the six pose fields.
   * @param {{wallBox: {center: {x: number, y: number, z: number}}, facing: {x: number, z: number}}} framing
   *   framingBounds(layout) (metres)
   */
  resetTo(framing) {
    if (framing.aligned && framing.centre) {
      // 03 12.7, 12.16: an alignment ('center-pos-x' or 'center-neg-x'): 5 m along the turned centre normal from the
      // wall centre, at eye height, looking at the wall's mid-height above the centre point
      const p = wrapDeg(framing.viewYawDeg);
      const n = quarterExactTrig(p);
      const C = framing.centre.point;
      const h = framing.wallBox.center.y;
      this.posX = C.x + CineCamera.RESET_DISTANCE_M * n.sin;
      this.posY = CineCamera.RESET_EYE_HEIGHT_M;
      this.posZ = C.z + CineCamera.RESET_DISTANCE_M * n.cos;
      this.rotX = Math.atan2(h - CineCamera.RESET_EYE_HEIGHT_M, CineCamera.RESET_DISTANCE_M) * 180 / Math.PI;
      this.rotY = p;
      this.rotZ = 0;
      return;
    }
    const c = framing.wallBox.center;
    const f = framing.facing;
    this.posX = c.x + CineCamera.RESET_DISTANCE_M * f.x;
    this.posY = c.y;
    this.posZ = c.z + CineCamera.RESET_DISTANCE_M * f.z;
    this.rotX = 0;
    this.rotY = wrapDeg(Math.atan2(f.x, f.z) * 180 / Math.PI);
    this.rotZ = 0;
  }

  /**
   * The first word of the preset name for the preview header ('Full', 'Super', 'ARRI', ...).
   * Ports: index.html@cd3fd3f line 3732.
   * Side effects: none.
   * @returns {string}
   */
  presetShortName() {
    // LEGACY(B-L34): first word of the preset name ('Micro' for Micro 4/3); 'Custom' only for unknown keys.
    return FILMBACK_PRESETS[this.filmback]?.name.split(' ')[0] || 'Custom';
  }

  /**
   * Gizmo translate on the camera (the Selectable 'camera' is CameraController; it calls this).
   * Ports: index.html@cd3fd3f lines 3338-3340.
   * Side effects: writes posX, posY, posZ.
   * @param {number} dx
   * @param {number} dy
   * @param {number} dz
   */
  translateBy(dx, dy, dz) {
    const { posX, posY, posZ } = CineCamera.LIMITS;
    // The gizmo clamps posY at the floor and never Z below the far bound, like the input rules since 08 P2-11c and the
    // pilot since 08 P2-8c (B-L10 fixed); the ±100,000 m far bounds since 08 P2-13e.
    this.posX = clamp(this.posX + dx, posX.min, posX.max);
    this.posY = clamp(this.posY + dy, posY.min, posY.max);
    this.posZ = clamp(this.posZ + dz, posZ.min, posZ.max);
  }

  /**
   * Gizmo rotate on the camera. deltaDeg already carries Strategies.gizmoRotateSign, so `rotX + (-a)` is
   * bit-identical to legacy `rotX - a`. Since 08 P2-8c (B-L10 fixed) the pan and the roll are wrapped into (-180, 180]
   * (wrapDeg; legacy left the pan unbounded and clamped the roll at +-180); the tilt is clamped to [-90, 90] as before.
   * Ports: index.html@cd3fd3f lines 3376-3384.
   * Side effects: writes rotX, rotY or rotZ.
   * @param {'x'|'y'|'z'} axis  any value other than 'x' and 'y' acts on Z, like the legacy else branch
   * @param {number} deltaDeg   signed degrees
   */
  rotateBy(axis, deltaDeg) {
    // LEGACY(B-L28): world-space rings write the Euler channels directly (x clamped to [-90, 90]; y and z wrapped
    // into (-180, 180] since 08 P2-8c).
    if (axis === 'x') {
      this.rotX = Math.max(-90, Math.min(90, this.rotX + deltaDeg));
    } else if (axis === 'y') {
      this.rotY = wrapDeg(this.rotY + deltaDeg);
    } else {
      this.rotZ = wrapDeg(this.rotZ + deltaDeg);
    }
  }

  /**
   * Pilot mouse-look. Since 08 P2-8c (B-L10 fixed) the pan is wrapped into (-180, 180] (wrapDeg); legacy left it
   * unbounded.
   * Ports: index.html@cd3fd3f lines 3551-3552.
   * Side effects: writes rotY, rotX.
   * @param {number} deltaX  pixels
   * @param {number} deltaY  pixels
   */
  pilotLook(deltaX, deltaY) {
    this.rotY = wrapDeg(this.rotY - deltaX * 0.3);
    this.rotX = Math.max(-90, Math.min(90, this.rotX - deltaY * 0.3));
  }

  /**
   * Pilot keyboard movement for one frame: per pressed key, in legacy order, the legacy += / -= statements;
   * then ALWAYS the posY floor clamp: 0 since 08 P2-8c (B-L10 fixed: the floor of the input and the gizmo; legacy 0.1).
   * Z is never clamped.
   * Ports: index.html@cd3fd3f lines 3578-3611.
   * Side effects: writes posX, posY, posZ (posY every call).
   * @param {{forward: boolean, back: boolean, left: boolean, right: boolean, down: boolean, up: boolean}} keys
   *   forward = W/ArrowUp, back = S/ArrowDown, left = A/ArrowLeft, right = D/ArrowRight, down = Q, up = E
   * @param {{x: number, y: number, z: number}} forward  normalised forward vector
   * @param {{x: number, y: number, z: number}} right    normalised right vector
   * @param {number} speed                               metres per frame (legacy pilotMoveSpeed)
   * @returns {boolean} moved: whether any movement key was pressed
   */
  pilotFly(keys, forward, right, speed) {
    let moved = false;

    if (keys.forward) {
      this.posX += forward.x * speed;
      this.posY += forward.y * speed;
      this.posZ += forward.z * speed;
      moved = true;
    }
    if (keys.back) {
      this.posX -= forward.x * speed;
      this.posY -= forward.y * speed;
      this.posZ -= forward.z * speed;
      moved = true;
    }
    if (keys.left) {
      this.posX -= right.x * speed;
      this.posZ -= right.z * speed;
      moved = true;
    }
    if (keys.right) {
      this.posX += right.x * speed;
      this.posZ += right.z * speed;
      moved = true;
    }
    if (keys.down) {
      this.posY -= speed;
      moved = true;
    }
    if (keys.up) {
      this.posY += speed;
      moved = true;
    }

    // The stage floor (08 P2-8c), applied every call like the legacy clamp; a no-op unless a key moved the camera below it;
    // and the far bounds of LIMITS (08 P2-13e).
    const { posX, posY, posZ } = CineCamera.LIMITS;
    this.posX = clamp(this.posX, posX.min, posX.max);
    this.posY = clamp(this.posY, posY.min, posY.max);
    this.posZ = clamp(this.posZ, posZ.min, posZ.max);

    return moved;
  }
}
