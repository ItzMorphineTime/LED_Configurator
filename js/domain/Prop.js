/**
 * @module domain/Prop
 * Reference props placed in front of the wall (legacy `showPerson`/`personSettings`, `showCar`/`carSettings`):
 * pose, scale, visibility, the input field rules and the gizmo arithmetic; since 03 T1 the position LIMITS and the
 * pivot re-expression translateStage (docs/improvements/03-pivot.md 4.1, 6.5).
 * Legacy source: index.html@cd3fd3f 1336-1351 (state), 3129 / 3131 (gizmo anchor heights), 3347-3360 (gizmo
 * translate), 3388-3399 (gizmo rotate), 4344-4392 (inputs).
 * Layer: domain (may import legacy; THREE-free and DOM-free).
 */

import { orDefault } from '../legacy/LegacyCompat.js';
import { clamp, deepFreeze, STAGE_POSITION_LIMIT_M, wrapDeg } from './rules.js';

/**
 * A reference prop (person or car): pose, scale and visibility, written only through its methods
 * (ARCHITECTURE.md section 4).
 */
export class Prop {
  /** @type {'person'|'car'} the Selectable id */
  kind;
  /** @type {string} 'Person' | 'Car' (selection badge) */
  label;
  /** @type {number} gizmo anchor height in metres: 0.9 (person) | 0.5 (car) */
  gizmoAnchorY;
  /** legacy showPerson / showCar */
  visible = false;
  /** @type {number} */
  posX;
  /** @type {number} */
  posZ;
  /** @type {number} degrees */
  rotY;
  /** @type {number} */
  scale;

  /**
   * Side effects: none.
   * @param {{kind: 'person'|'car', label: string, posX: number, posZ: number, rotY?: number, scale?: number,
   *          gizmoAnchorY: number}} options
   */
  constructor({ kind, label, posX, posZ, rotY = 0, scale = 1, gizmoAnchorY }) {
    this.kind = kind;
    this.label = label;
    this.gizmoAnchorY = gizmoAnchorY;
    this.posX = posX;
    this.posZ = posZ;
    this.rotY = rotY;
    this.scale = scale;
  }

  /**
   * Prop input rules (person 4345-4358, car 4376-4389). writeBack mirrors whether legacy assigned `this.value`.
   * Ports: index.html@cd3fd3f lines 4345-4358.
   * @type {Readonly<Record<string, Readonly<{parse: (raw: string) => number, writeBack: boolean}>>>}
   */
  static FIELD_RULES = Object.freeze({
    posX: Object.freeze({ parse: (r) => orDefault(parseFloat(r), 0), writeBack: false }),
    posZ: Object.freeze({ parse: (r) => orDefault(parseFloat(r), 0), writeBack: false }),
    rotY: Object.freeze({ parse: (r) => Math.max(-180, Math.min(180, orDefault(parseFloat(r), 0))), writeBack: true }),
    scale: Object.freeze({ parse: (r) => Math.max(0.5, Math.min(2, orDefault(parseFloat(r), 1))), writeBack: true }),
  });

  /**
   * The writer bounds of the floor position (spec 07 C22 and 4.3: x and z within +-100,000 m), shared with the
   * validator ranges; since 03 T1 translateStage clamps through them (07 C45); 08 P2-13e makes the other writers clamp.
   * @type {Readonly<{posX: {min: number, max: number}, posZ: {min: number, max: number}}>}
   */
  static LIMITS = deepFreeze({
    posX: { min: -STAGE_POSITION_LIMIT_M, max: STAGE_POSITION_LIMIT_M },
    posZ: { min: -STAGE_POSITION_LIMIT_M, max: STAGE_POSITION_LIMIT_M },
  });

  /**
   * Stores the parsed value of a prop input (model only; the caller writes back iff FIELD_RULES[field].writeBack).
   * Ports: index.html@cd3fd3f lines 4345, 4349, 4353, 4358 (car 4376, 4380, 4384, 4389).
   * Side effects: writes this[field].
   * @param {string} field  a FIELD_RULES key
   * @param {string} raw    the input's value
   * @returns {number} the stored value
   */
  setField(field, raw) {
    this[field] = Prop.FIELD_RULES[field].parse(raw);
    return this[field];
  }

  /**
   * Gizmo translate on the prop.
   * Ports: index.html@cd3fd3f lines 3348-3349 (car 3355-3356).
   * Side effects: writes posX, posZ.
   * @param {number} dx
   * @param {number} dy  ignored
   * @param {number} dz
   */
  translateBy(dx, dy, dz) {
    // LEGACY(B-L22): props move on the floor only; the Y arrow (dy) is inert.
    this.posX += dx;
    this.posZ += dz;
  }

  /**
   * Re-expression after a pivot change (03 6.5): the stage origin moved by -(dx, dz), so the prop keeps its place
   * relative to the wall. Clamped through LIMITS (07 C45); rotY and scale are untouched.
   * Side effects: writes posX, posZ.
   * @param {number} dx  metres
   * @param {number} dz  metres
   */
  translateStage(dx, dz) {
    const { posX, posZ } = Prop.LIMITS;
    this.posX = clamp(this.posX + dx, posX.min, posX.max);
    this.posZ = clamp(this.posZ + dz, posZ.min, posZ.max);
  }

  /**
   * The rigid re-expression of an explicit pivot or orientation edit (03 12.6): with a zero yaw change exactly
   * translateStage(dx, dz); otherwise the position turns about the stage origin by the change, (dx, dz) is added, each
   * component is clamped through LIMITS and rotY turns with it (wrapDeg); scale is untouched.
   * Side effects: writes posX, posZ and maybe rotY.
   * @param {{yawDeg: number, cos: number, sin: number, dx: number, dz: number}} change  WallLayout.stageChange
   */
  reexpressStage({ yawDeg, cos, sin, dx, dz }) {
    if (yawDeg === 0) {
      this.translateStage(dx, dz);
      return;
    }
    const { posX, posZ } = Prop.LIMITS;
    const x = this.posX * cos + this.posZ * sin + dx;
    const z = -this.posX * sin + this.posZ * cos + dz;
    this.posX = clamp(x, posX.min, posX.max);
    this.posZ = clamp(z, posZ.min, posZ.max);
    this.rotY = wrapDeg(this.rotY + yawDeg);
  }

  /**
   * Gizmo rotate on the prop.
   * Ports: index.html@cd3fd3f lines 3389-3392 (car 3395-3398).
   * Side effects: writes rotY when axis is 'y'.
   * @param {'x'|'y'|'z'} axis
   * @param {number} deltaDeg  signed degrees (already carries Strategies.gizmoRotateSign)
   * @returns {boolean} whether the prop rotated (only the Y ring acts)
   */
  rotateBy(axis, deltaDeg) {
    // LEGACY(B-L22): the X and Z rings are inert on props.
    if (axis === 'y') {
      this.rotY += deltaDeg;
      return true;
    }
    return false;
  }
}

/** The person prop (legacy personSettings 1339-1344; gizmo anchor 0.9 m, 3129). */
export class PersonProp extends Prop {
  /** Side effects: none. */
  constructor() { super({ kind: 'person', label: 'Person', posX: 2, posZ: 2, gizmoAnchorY: 0.9 }); }
}

/** The car prop (legacy carSettings 1346-1351; gizmo anchor 0.5 m, 3131). */
export class CarProp extends Prop {
  /** Side effects: none. */
  constructor() { super({ kind: 'car', label: 'Car', posX: 4, posZ: 3, gizmoAnchorY: 0.5 }); }
}
