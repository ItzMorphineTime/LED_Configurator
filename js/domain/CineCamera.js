/**
 * @module domain/CineCamera
 * The simulated film camera (legacy `cameraSettings` + `cameraPreviewEnabled`): filmback, lens and pose with the
 * legacy field names, the filmback presets, the lens/coverage/safe-distance maths, the input field rules and the
 * gizmo/pilot pose arithmetic. Angles are degrees; the Euler order used by the views is 'YXZ'
 * (tilt = rotX, pan = rotY, roll = rotZ).
 * Legacy source: index.html@cd3fd3f 1299, 1306-1331 (state), 2471-2534 (coverage), 2550-2564 (reset),
 * 2597-2612 (safe distance D), 3337-3340 / 3375-3384 (gizmo), 3544-3552 / 3564-3611 (pilot),
 * 3732 (preset short name), 4251-4317 (inputs).
 * Layer: domain (may import legacy; THREE-free and DOM-free).
 */

import { orDefault } from '../legacy/LegacyCompat.js';

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
 * @property {(raw: string) => number} parse  the legacy input expression
 * @property {boolean} writeBack              whether legacy assigned the parsed value back to the input
 */

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
   * Ports: index.html@cd3fd3f lines 4266-4317.
   * @type {Readonly<Record<string, Readonly<FieldRule>>>}
   */
  static FIELD_RULES = Object.freeze({
    filmbackWidth: Object.freeze({ parse: (r) => Math.max(1, Math.min(100, orDefault(parseFloat(r), 36))), writeBack: true }),
    filmbackHeight: Object.freeze({ parse: (r) => Math.max(1, Math.min(100, orDefault(parseFloat(r), 24))), writeBack: true }),
    focalLength: Object.freeze({ parse: (r) => Math.max(8, Math.min(800, orDefault(parseFloat(r), 35))), writeBack: true }),
    posX: Object.freeze({ parse: (r) => orDefault(parseFloat(r), 0), writeBack: false }),
    posY: Object.freeze({ parse: (r) => Math.max(0, orDefault(parseFloat(r), 1.5)), writeBack: true }),
    posZ: Object.freeze({ parse: (r) => Math.max(0.1, orDefault(parseFloat(r), 5)), writeBack: true }),
    rotX: Object.freeze({ parse: (r) => Math.max(-90, Math.min(90, orDefault(parseFloat(r), 0))), writeBack: true }),
    rotY: Object.freeze({ parse: (r) => Math.max(-180, Math.min(360, orDefault(parseFloat(r), 0))), writeBack: true }),
    rotZ: Object.freeze({ parse: (r) => Math.max(-180, Math.min(180, orDefault(parseFloat(r), 0))), writeBack: true }),
  });

  /**
   * Stores the parsed value of a lens/pose input (model only; the caller writes back iff FIELD_RULES[field].writeBack).
   * Ports: index.html@cd3fd3f lines 4267, 4273, 4279, 4285, 4290, 4296, 4302, 4308, 4314.
   * Side effects: writes this[field].
   * @param {string} field  a FIELD_RULES key
   * @param {string} raw    the input's value
   * @returns {number} the stored value
   */
  setField(field, raw) {
    this[field] = CineCamera.FIELD_RULES[field].parse(raw);
    return this[field];
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
   * ui/CameraPanel; the status colours are Theme.UiColors.status).
   * Ports: index.html@cd3fd3f lines 2473-2531.
   * Side effects: none.
   * @param {{totalWidth: number, maxHeight: number}} bounds  flat wall bounds (metres)
   * @returns {{frameWidth: number, frameHeight: number, status: 'within'|'offCenter'|'exceeds', safeDistance: number}}
   */
  coverage(bounds) {
    const hFov = this.hFov();
    const vFov = this.vFov();

    // LEGACY(B-M10): the distance is posZ and the wall is the flat rectangle [0, totalWidth] x [0, maxHeight];
    // rotation, curvature and angle offsets are ignored.
    const distToWall = this.posZ;
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

    const withinBounds = frameLeft >= 0 && frameRight <= totalWallWidth &&
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
    return { frameWidth, frameHeight, status, safeDistance };
  }

  /**
   * Centres the camera on the flat wall, 5 m away, with zero rotation.
   * Ports: index.html@cd3fd3f lines 2559-2564.
   * Side effects: writes the six pose fields.
   * @param {{totalWidth: number, maxHeight: number}} bounds  flat wall bounds (metres)
   */
  resetTo(bounds) {
    this.posX = bounds.totalWidth / 2;
    this.posY = bounds.maxHeight / 2;
    this.posZ = 5;
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
