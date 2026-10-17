// A small, mathematically real stand-in for the parts of three.js r128 that the interaction and pivot-marker modules
// use (Vector3, Quaternion, Euler, Plane, Ray, Layers, Object3D/Group/Mesh/LineSegments, materials, buffer geometry),
// for unit tests that install it as window.THREE before importing js/vendor/three.js (03 T5 tests). Geometry classes
// record their constructor arguments; materials record their parameters; nothing renders.
// Imported by tests only (the unit-test glob matches *.test.mjs, never this file).

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v) { return this.crossVectors(this.clone(), v); }
  crossVectors(a, b) {
    return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  lengthSq() { return this.dot(this); }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() { return this.multiplyScalar(1 / (this.length() || 1)); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  applyQuaternion(q) {
    const { x, y, z } = this;
    const ix = q.w * x + q.y * z - q.z * y;
    const iy = q.w * y + q.z * x - q.x * z;
    const iz = q.w * z + q.x * y - q.y * x;
    const iw = -q.x * x - q.y * y - q.z * z;
    return this.set(ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
      iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
      iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x);
  }
}

export class Quaternion {
  constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
}

export class Euler {
  constructor(x = 0, y = 0, z = 0, order = 'XYZ') { this.x = x; this.y = y; this.z = z; this.order = order; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

export class Layers {
  mask = 1;
  set(n) { this.mask = (1 << n) | 0; }
  enable(n) { this.mask |= (1 << n) | 0; }
  disable(n) { this.mask &= ~((1 << n) | 0); }
  enableAll() { this.mask = 0xffffffff | 0; }
  test(l) { return (this.mask & l.mask) !== 0; }
}

export class Plane {
  constructor() { this.normal = new Vector3(1, 0, 0); this.constant = 0; }
  setFromNormalAndCoplanarPoint(n, p) { this.normal.copy(n); this.constant = -p.dot(this.normal); return this; }
  distanceToPoint(p) { return this.normal.dot(p) + this.constant; }
}

export class Ray {
  constructor() { this.origin = new Vector3(); this.direction = new Vector3(0, 0, -1); }
  intersectPlane(plane, target) {
    const denom = plane.normal.dot(this.direction);
    if (denom === 0) return null;
    const t = -(this.origin.dot(plane.normal) + plane.constant) / denom;
    if (t < 0) return null;
    return target.copy(this.direction).multiplyScalar(t).add(this.origin);
  }
}

export class Raycaster {
  constructor() { this.ray = new Ray(); this.layers = new Layers(); }
  setFromCamera() {}
  intersectObjects() { return []; }
}

export class Object3D {
  constructor() {
    this.isObject3D = true;
    this.children = [];
    this.parent = null;
    this.position = new Vector3();
    this.rotation = new Euler();
    this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1);
    this.visible = true;
    this.renderOrder = 0;
    this.frustumCulled = true;
    this.layers = new Layers();
    this.userData = {};
  }
  add(...objects) { for (const o of objects) { o.parent = this; this.children.push(o); } return this; }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); return this; }
  traverse(cb) { cb(this); for (const c of this.children) c.traverse(cb); }
}

export class Group extends Object3D { constructor() { super(); this.isGroup = true; } }
export class Scene extends Object3D {}

export class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.isMesh = true; this.geometry = geometry; this.material = material; }
}

export class LineSegments extends Object3D {
  constructor(geometry, material) {
    super(); this.isLine = true; this.isLineSegments = true; this.geometry = geometry; this.material = material;
  }
  /** r128 LineSegments.computeLineDistances: per segment pair, 0 at its start and its length at its end. */
  computeLineDistances() {
    const p = this.geometry.getAttribute('position');
    const d = [];
    for (let i = 0; i < p.count; i += 2) {
      d.push(0, Math.hypot(p.getX(i + 1) - p.getX(i), p.getY(i + 1) - p.getY(i), p.getZ(i + 1) - p.getZ(i)));
    }
    this.geometry.setAttribute('lineDistance', new Float32BufferAttribute(d, 1));
    return this;
  }
}

export class Color {
  constructor(hex = 0xffffff) { this.hex = hex; }
  setHex(h) { this.hex = h; return this; }
  getHex() { return this.hex; }
}

class Material {
  constructor(params = {}) {
    this.visible = true;
    this.opacity = 1;
    this.transparent = false;
    this.disposed = 0;
    Object.assign(this, params);
    this.color = new Color(params.color ?? 0xffffff);
    this.params = params;
  }
  dispose() { this.disposed++; }
}
export class MeshBasicMaterial extends Material {}
export class LineBasicMaterial extends Material {}
export class LineDashedMaterial extends Material { constructor(p) { super(p); this.isLineDashedMaterial = true; } }

export class Float32BufferAttribute {
  constructor(array, itemSize) { this.array = Float32Array.from(array); this.itemSize = itemSize; this.count = array.length / itemSize; }
  getX(i) { return this.array[i * this.itemSize]; }
  getY(i) { return this.array[i * this.itemSize + 1]; }
  getZ(i) { return this.array[i * this.itemSize + 2]; }
  setX(i, v) { this.array[i * this.itemSize] = v; return this; }
  setXYZ(i, x, y, z) { const k = i * this.itemSize; this.array[k] = x; this.array[k + 1] = y; this.array[k + 2] = z; return this; }
}

export class BufferGeometry {
  constructor(...args) { this.attributes = {}; this.args = args; this.disposed = 0; }
  setAttribute(name, a) { this.attributes[name] = a; return this; }
  getAttribute(name) { return this.attributes[name]; }
  dispose() { this.disposed++; }
}
export class CylinderGeometry extends BufferGeometry {}
export class ConeGeometry extends BufferGeometry {}
export class TorusGeometry extends BufferGeometry {}
export class OctahedronGeometry extends BufferGeometry {}
export class SphereGeometry extends BufferGeometry {}

export const MathUtils = { degToRad: (d) => d * Math.PI / 180 };

/** The namespace object to install as window.THREE. */
export const FakeTHREE = {
  Vector3, Quaternion, Euler, Layers, Plane, Ray, Raycaster, Object3D, Group, Scene, Mesh, LineSegments, Color,
  MeshBasicMaterial, LineBasicMaterial, LineDashedMaterial, Float32BufferAttribute, BufferGeometry, CylinderGeometry,
  ConeGeometry, TorusGeometry, OctahedronGeometry, SphereGeometry, MathUtils,
};
