/**
 * @module domain/CineCamera
 * The simulated film camera (legacy `cameraSettings` + `cameraPreviewEnabled`): filmback, lens and pose with the
 * legacy field names, the filmback presets, the lens/coverage/safe-distance maths, the input field rules and the
 * gizmo/pilot pose arithmetic. Angles are degrees; the Euler order used by the views is 'YXZ'
 * (tilt = rotX, pan = rotY, roll = rotZ). Feature 3 (03 T1, 4.1): the pose LIMITS, the pivot re-expression
 * translateStage and the posZ input rule's wall-plane context.
 * Legacy source: index.html@cd3fd3f 1299, 1306-1331 (state), 2471-2534 (coverage), 2550-2564 (reset),
 * 2597-2612 (safe distance D), 3337-3340 / 3375-3384 (gizmo), 3544-3552 / 3564-3611 (pilot),
 * 3732 (preset short name), 4251-4317 (inputs).
 * Layer: domain (may import legacy; THREE-free and DOM-free).
 */

import { orDefault } from '../legacy/LegacyCompat.js';
import { clamp, deepFreeze, STAGE_POSITION_LIMIT_M } from './rules.js';

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
 * The context of a camera input rule (03 4.1): wallZ is the stage z of the flat wall plane (`framingBounds().wallZ`,
 * the negated stage-origin z; 0 at the identity pivot and for every pivot whose stage origin lies on the wall plane).
 * @typedef {{wallZ: number}} FieldContext
 */

/** The context of the legacy rules: the wall plane at stage z = 0. */
const WALL_PLANE_AT_ORIGIN = Object.freeze({ wallZ: 0 });

/** Rounds to 1 mm: the posZ minimum and fallback of a stage origin off the wall plane (03 4.1). */
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * The film camera: legacy `cameraSettings` field names plus the preview flag, with the lens, coverage and
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
   * posY: B-L9 via orDefault, so '0' gives 1.5.
   * posZ takes the FieldContext (03 4.1, T1): while ctx.wallZ === 0 (+0 or -0: the identity pivot and every pivot whose
   * stage origin lies on the wall plane) it is the legacy expression verbatim, B-L9 included ('0' gives 5); otherwise
   * (a stage origin off the wall plane, where 0 means "on the stage origin") a finite value is kept, floored at
   * r3(wallZ + 0.1), and a non-numeric entry gives max(r3(wallZ + 0.1), r3(wallZ + 5)). The other rules ignore ctx.
   * 08 P2-8b (B-L9) collapses both branches into one finiteOr rule; 08 P2-11c (step F) removes the minimum.
   * Ports: index.html@cd3fd3f lines 4266-4317.
   * @type {Readonly<Record<string, Readonly<FieldRule>>>}
   */
  static FIELD_RULES = Object.freeze({
    filmbackWidth: Object.freeze({ parse: (r) => Math.max(1, Math.min(100, orDefault(parseFloat(r), 36))), writeBack: true }),
    filmbackHeight: Object.freeze({ parse: (r) => Math.max(1, Math.min(100, orDefault(parseFloat(r), 24))), writeBack: true }),
    focalLength: Object.freeze({ parse: (r) => Math.max(8, Math.min(800, orDefault(parseFloat(r), 35))), writeBack: true }),
    posX: Object.freeze({ parse: (r) => orDefault(parseFloat(r), 0), writeBack: false }),
    posY: Object.freeze({ parse: (r) => Math.max(0, orDefault(parseFloat(r), 1.5)), writeBack: true }),
    posZ: Object.freeze({
      parse: (r, ctx = WALL_PLANE_AT_ORIGIN) => {
        // The wall plane at the stage origin (the identity pivot): the legacy rule verbatim (B-L9 kept, '0' gives 5).
        if (ctx.wallZ === 0) return Math.max(0.1, orDefault(parseFloat(r), 5));
        // A stage origin off the wall plane (03 4.1): 0 is a valid stage coordinate, so no orDefault here.
        const v = parseFloat(r);
        const minZ = r3(ctx.wallZ + 0.1);
        return Number.isFinite(v) ? Math.max(minZ, v) : Math.max(minZ, r3(ctx.wallZ + 5));
      },
      writeBack: true,
    }),
    rotX: Object.freeze({ parse: (r) => Math.max(-90, Math.min(90, orDefault(parseFloat(r), 0))), writeBack: true }),
    rotY: Object.freeze({ parse: (r) => Math.max(-180, Math.min(360, orDefault(parseFloat(r), 0))), writeBack: true }),
    rotZ: Object.freeze({ parse: (r) => Math.max(-180, Math.min(180, orDefault(parseFloat(r), 0))), writeBack: true }),
  });

  /**
   * The writer bounds of the pose (spec 07 C22 and 4.3: x and z within +-100,000 m, y in [0, 100,000]), shared with the
   * validator ranges; since 03 T1 translateStage clamps through them (07 C45). They are not the input rules: the posZ
   * input keeps its own minimum (FIELD_RULES.posZ, until 08 P2-11c), and 08 P2-13e makes every other writer clamp too.
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
    this[field] = CineCamera.FIELD_RULES[field].parse(raw, ctx);
    return this[field];
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
   * The largest distance at which the frame still fits inside the (flat) wall in both dimensions.
   * Ports: index.html@cd3fd3f lines 2529-2531 (== 2610-2612).
   * Side effects: none.
   * @param {{totalWidth: number, maxHeight: number}} bounds  flat wall bounds (metres)
   * @returns {number} metres
   */
  maxSafeDistance(bounds) {
    const hFov = this.hFov();
    const vFov = this.vFov();
    const maxSafeDistWidth = bounds.totalWidth / (2 * Math.tan(hFov / 2));
    const maxSafeDistHeight = bounds.maxHeight / (2 * Math.tan(vFov / 2));
    return Math.min(maxSafeDistWidth, maxSafeDistHeight);
  }

  /**
   * Frame size at the wall and the coverage status (the DOM writes of 2484-2485, 2515-2525, 2533 live in
   * ui/CameraPanel; the status colours are Theme.UiColors.status). Since 03 T3 the flat wall is the 'flat-pivot'
   * rectangle of framingBounds (03 6.6): x in [minX, minX + totalWidth], y in [0, maxHeight], in the plane z = wallZ, so
   * the distance is posZ - wallZ and the edges are relative to minX. At the identity pivot minX = wallZ = +0 and every
   * value is the legacy one bit for bit (posZ - 0 === posZ, 0 + W === W).
   * Ports: index.html@cd3fd3f lines 2473-2531.
   * Side effects: none.
   * @param {{totalWidth: number, maxHeight: number, minX: number, wallZ: number}} bounds  'flat-pivot' bounds (metres)
   * @returns {{frameWidth: number, frameHeight: number, status: 'within'|'offCenter'|'exceeds', safeDistance: number,
   *            distToWall: number}}  distToWall (03 T3) feeds the "Distance to wall plane" readout (03 T6)
   */
  coverage(bounds) {
    const hFov = this.hFov();
    const vFov = this.vFov();

    // LEGACY(B-M10): the distance is posZ - wallZ and the wall is the flat rectangle [minX, minX + totalWidth] x
    // [0, maxHeight] at z = wallZ; rotation, curvature and angle offsets are ignored.
    const distToWall = this.posZ - bounds.wallZ;
    const frameWidth = 2 * Math.tan(hFov / 2) * distToWall;
    const frameHeight = 2 * Math.tan(vFov / 2) * distToWall;

    const totalWallWidth = bounds.totalWidth;
    const maxWallHeight = bounds.maxHeight;
    const fitsWidth = frameWidth <= totalWallWidth;
    const fitsHeight = frameHeight <= maxWallHeight;

    const camCenterX = this.posX;
    const camCenterY = this.posY;
    const frameLeft = camCenterX - frameWidth / 2;
    const frameRight = camCenterX + frameWidth / 2;
    const frameBottom = camCenterY - frameHeight / 2;
    const frameTop = camCenterY + frameHeight / 2;

    const withinBounds = frameLeft >= bounds.minX && frameRight <= bounds.minX + totalWallWidth &&
                         frameBottom >= 0 && frameTop <= maxWallHeight;

    let status;
    if (withinBounds) {
      status = 'within';
    } else if (fitsWidth && fitsHeight) {
      status = 'offCenter';
    } else {
      status = 'exceeds';
    }

    const safeDistance = this.maxSafeDistance(bounds);
    return { frameWidth, frameHeight, status, safeDistance, distToWall };
  }

  /**
   * Centres the camera on the flat wall, 5 m in front of its plane, with zero rotation. Since 03 T3 the 'flat-pivot'
   * bounds (03 6.6): posX = minX + totalWidth / 2, posZ = wallZ + 5 (at the identity pivot 0 + w / 2 === w / 2 and
   * 0 + 5 === 5: the legacy pose).
   * Ports: index.html@cd3fd3f lines 2559-2564.
   * Side effects: writes the six pose fields.
   * @param {{totalWidth: number, maxHeight: number, minX: number, wallZ: number}} bounds  'flat-pivot' bounds (metres)
   */
  resetTo(bounds) {
    this.posX = bounds.minX + bounds.totalWidth / 2;
    this.posY = bounds.maxHeight / 2;
    this.posZ = bounds.wallZ + 5;
    this.rotX = 0;
    this.rotY = 0;
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
    this.posX += dx;
    // LEGACY(B-L10): the gizmo clamps posY at 0 (pilot clamps at 0.1 per frame); Z is unclamped.
    this.posY = Math.max(0, this.posY + dy);
    this.posZ += dz;
  }

  /**
   * Gizmo rotate on the camera. deltaDeg already carries Strategies.gizmoRotateSign, so `rotX + (-a)` is
   * bit-identical to legacy `rotX - a`.
   * Ports: index.html@cd3fd3f lines 3376-3384.
   * Side effects: writes rotX, rotY or rotZ.
   * @param {'x'|'y'|'z'} axis  any value other than 'x' and 'y' acts on Z, like the legacy else branch
   * @param {number} deltaDeg   signed degrees
   */
  rotateBy(axis, deltaDeg) {
    // LEGACY(B-L28): world-space rings write the Euler channels directly (x clamped to [-90, 90],
    // z to [-180, 180], y unbounded).
    if (axis === 'x') {
      this.rotX = Math.max(-90, Math.min(90, this.rotX + deltaDeg));
    } else if (axis === 'y') {
      this.rotY += deltaDeg;
    } else {
      this.rotZ = Math.max(-180, Math.min(180, this.rotZ + deltaDeg));
    }
  }

  /**
   * Pilot mouse-look.
   * Ports: index.html@cd3fd3f lines 3551-3552.
   * Side effects: writes rotY, rotX.
   * @param {number} deltaX  pixels
   * @param {number} deltaY  pixels
   */
  pilotLook(deltaX, deltaY) {
    this.rotY -= deltaX * 0.3;
    this.rotX = Math.max(-90, Math.min(90, this.rotX - deltaY * 0.3));
  }

  /**
   * Pilot keyboard movement for one frame: per pressed key, in legacy order, the legacy += / -= statements;
   * then ALWAYS the posY floor clamp.
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

    // LEGACY(B-L10): silent per-frame clamp at 0.1, applied even when nothing moved.
    this.posY = Math.max(0.1, this.posY);

    return moved;
  }
}
