// Unit tests for js/render/MaterialOverride.js (docs/improvements/01-normals.md 5.2, 8.1; acceptance criterion 12; 01 T5),
// with plain objects (the module imports nothing): apply stashes each original once, restore puts every original back
// exactly once and clears the stash, a Material[] comes back as the same array object (04 2.3 row 01-1), and the
// rebuild order of LEDWallView (restore, then dispose the old wall) never hands the shared debug material to dispose.
// Run: node --test tests/unit/material-override.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { MaterialOverride } from '../../js/render/MaterialOverride.js';

/** A material stand-in that records dispose() calls. */
const material = (name, disposed = []) => ({ name, dispose() { disposed.push(name); } });
const mesh = (m) => ({ material: m });

describe('MaterialOverride', () => {
  test('apply shows the override on every mesh; restore brings back the originals and reports the count', () => {
    const o = new MaterialOverride();
    const a = mesh(material('a')), b = mesh(material('b'));
    const [ma, mb] = [a.material, b.material];
    const debug = material('debug');
    assert.equal(o.active, false);
    o.apply([a, b], debug);
    assert.equal(o.active, true);
    assert.equal(a.material, debug);
    assert.equal(b.material, debug);
    assert.equal(o.restore(), 2);
    assert.equal(a.material, ma);
    assert.equal(b.material, mb);
    assert.equal(o.active, false);
    assert.equal(o.restore(), 0, 'a second restore has nothing to do');
  });

  test('apply twice (or with another override) stashes the original once, so restore brings back the original', () => {
    const o = new MaterialOverride();
    const a = mesh(material('a'));
    const original = a.material;
    o.apply([a], material('faceOrientation'));
    o.apply([a], material('normalColors'));
    assert.equal(a.material.name, 'normalColors');
    assert.equal(o.restore(), 1);
    assert.equal(a.material, original);
  });

  test('a mesh whose material is a Material[] gets the same array object back', () => {
    const o = new MaterialOverride();
    const groups = [material('s0'), material('s1')];
    const combined = mesh(groups);
    o.apply([combined], material('debug'));
    assert.equal(combined.material.name, 'debug');
    o.restore();
    assert.equal(combined.material, groups);
    assert.deepEqual(combined.material.map((m) => m.name), ['s0', 's1']);
  });

  test('meshes added by a later apply join the stash; restore restores every one exactly once', () => {
    const o = new MaterialOverride();
    const a = mesh(material('a')), b = mesh(material('b'));
    const debug = material('debug');
    o.apply([a], debug);
    o.apply([a, b], debug);
    let writes = 0;
    for (const m of [a, b]) {
      let value = m.material;
      Object.defineProperty(m, 'material', { get: () => value, set: (v) => { writes++; value = v; } });
    }
    assert.equal(o.restore(), 2);
    assert.equal(writes, 2);
    assert.deepEqual([a.material.name, b.material.name], ['a', 'b']);
  });

  test('rebuild order (AC 12): restore, then dispose the old wall: the debug material is never disposed', () => {
    const disposed = [];
    const o = new MaterialOverride();
    const debug = material('debug', disposed);
    let wall = [mesh(material('wall-1a', disposed)), mesh(material('wall-1b', disposed))];
    for (let rebuild = 2; rebuild <= 4; rebuild++) {
      o.apply(wall, debug);                           // shading on (LEDWallView step 6 / setDebugShading)
      o.restore();                                    // LEDWallView.rebuild step 0
      for (const m of wall) m.material.dispose();     // step 1: the tracker disposes the old wall's materials
      wall = [mesh(material(`wall-${rebuild}a`, disposed)), mesh(material(`wall-${rebuild}b`, disposed))];
    }
    assert.ok(!disposed.includes('debug'));
    assert.deepEqual(disposed, ['wall-1a', 'wall-1b', 'wall-2a', 'wall-2b', 'wall-3a', 'wall-3b']);
  });
});
