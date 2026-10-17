// Unit tests of the whole-wall orientation (docs/improvements/03-pivot.md section 12, the owner's request of
// 2026-10-17; 12.12). F3-O1: the domain (test 1: OrientationAlign, WallPivot.orientation, setAlign, setYawOffset,
// parseYawOffset, isIdentity, clone, equals).
// Run: node --test tests/unit/orientation.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  OrientationAlign, ORIENTATION_ALIGNS, YAW_OFFSET_LIMIT_DEG, WallPivot,
} from '../../js/domain/Wall.js';

/** Deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('03 12.12 test 1: the orientation domain (12.4)', () => {
  test('OrientationAlign, ORIENTATION_ALIGNS (select order), YAW_OFFSET_LIMIT_DEG and the default (none, 0)', () => {
    assert.deepEqual({ ...OrientationAlign }, { CENTER_NEG_X: 'center-neg-x', NONE: 'none' });
    assert.ok(Object.isFrozen(OrientationAlign));
    assert.deepEqual(ORIENTATION_ALIGNS, ['center-neg-x', 'none']);
    assert.ok(Object.isFrozen(ORIENTATION_ALIGNS));
    assert.equal(YAW_OFFSET_LIMIT_DEG, 180);
    assert.equal(WallPivot.DEFAULT_ALIGN, 'none', "this unit keeps 'none' (12.11)");
    const pivot = new WallPivot();
    assert.deepEqual(pivot.orientation, { align: 'none', yawOffsetDeg: 0 });
    assert.equal(pivot.isIdentity, true);
  });

  test('parseYawOffset: finite -> clamped to +-180 and rounded to 0.1 degree, never orDefault, -0 normalised; idempotent', () => {
    const cases = [['0', 0], ['', null], ['abc', null], [200, 180], [-200, -180], ['12.34', 12.3], [-0.04, 0], [NaN, null],
      ['180', 180], ['-180', -180], ['180.04', 180], [' 7 ', 7], ['30deg', 30], [Infinity, null], [-Infinity, null],
      [undefined, null], [null, null], [0.05, 0.1], [-0.05, 0], [-0.06, -0.1], ['-12.35', -12.3], ['1e9', 180], [90, 90]];
    for (const [raw, want] of cases) {
      const got = WallPivot.parseYawOffset(raw);
      assert.ok(Object.is(got, want), `parseYawOffset(${String(raw)}) = ${got}, want ${want}`);
    }
    const rand = rng(12);
    for (let i = 0; i < 2000; i++) {
      const x = (rand() - 0.5) * (i % 2 ? 500 : 3);
      const once = WallPivot.parseYawOffset(x);
      assert.ok(Object.is(WallPivot.parseYawOffset(once), once), `idempotent at ${x}`);
      assert.ok(Object.is(WallPivot.parseYawOffset(String(x)), once), `text and number agree at ${x}`);
    }
  });

  test('setAlign: a known alignment stores and reports the change, replacing the object; an unknown one throws RangeError', () => {
    const pivot = new WallPivot();
    const before = pivot.orientation;
    assert.equal(pivot.setAlign('none'), false);
    assert.equal(pivot.setAlign('center-neg-x'), true);
    assert.equal(pivot.orientation.align, 'center-neg-x');
    assert.notEqual(pivot.orientation, before, 'replaced, not mutated');
    assert.deepEqual(before, { align: 'none', yawOffsetDeg: 0 }, 'a snapshot of the old object keeps its values');
    assert.equal(pivot.setAlign('center-neg-x'), false);
    assert.throws(() => pivot.setAlign('left'), { name: 'RangeError', message: 'Unknown orientation alignment "left"' });
    assert.throws(() => pivot.setAlign(undefined), RangeError);
    assert.equal(pivot.orientation.align, 'center-neg-x', 'nothing stored on a throw');
    assert.equal(pivot.isIdentity, false);
  });

  test('setYawOffset: parses, writes back the stored value, replaces the object; a rejected value writes nothing', () => {
    const pivot = new WallPivot();
    assert.equal(pivot.setYawOffset('30'), 30);
    assert.equal(pivot.isIdentity, false, 'a yaw offset alone is not the identity');
    const kept = pivot.orientation;
    assert.equal(pivot.setYawOffset('abc'), 30, 'rejected text writes nothing and returns the stored value');
    assert.equal(pivot.setYawOffset(''), 30);
    assert.equal(pivot.orientation, kept, 'a rejected value does not replace the object');
    assert.equal(pivot.setYawOffset(200), 180);
    assert.ok(Object.is(pivot.setYawOffset('0'), 0), "'0' is a valid yaw offset (no B-L9 fallback)");
    assert.equal(pivot.isIdentity, true);
    assert.equal(pivot.setYawOffset(-12.34), -12.3);
    assert.deepEqual(pivot.orientation, { align: 'none', yawOffsetDeg: -12.3 });
  });

  test('isIdentity, clone and equals cover the orientation; keepStageLayout still does not count for isIdentity', () => {
    const pivot = new WallPivot();
    pivot.setMode('wall-center');
    pivot.setOffset({ x: 1, y: 2, z: 3 });
    pivot.setAlign('center-neg-x');
    pivot.setYawOffset(15);
    const copy = pivot.clone();
    assert.notEqual(copy.orientation, pivot.orientation, 'deep copy');
    assert.deepEqual({ ...copy }, { ...pivot });
    assert.ok(copy.equals(pivot) && pivot.equals(copy));
    for (const change of [(p) => p.setAlign('none'), (p) => p.setYawOffset(16)]) {
      const other = pivot.clone();
      change(other);
      assert.equal(other.equals(pivot), false);
    }
    const id = new WallPivot();
    id.setKeepStageLayout(false);
    assert.equal(id.isIdentity, true);
    id.setAlign('center-neg-x');
    assert.equal(id.isIdentity, false, 'an alignment is not the identity');
    id.setAlign('none');
    assert.equal(id.isIdentity, true);
  });
});
