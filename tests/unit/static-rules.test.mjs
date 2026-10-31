// Unit tests of the static rules added by spec 07 (5.13, 8.1): S1, rule 21 of tests/static/check.mjs (task D7): every
// `${` of a template literal written as markup in js/ui/ starts with `${escapeHtml(` (08 P2-3a's fix of B-M4).
// Run: node --test tests/unit/static-rules.test.mjs   (zero dependencies)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lex, runChecks, unescapedMarkupInterpolations } from '../static/check.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The lines rule 21 flags in `src`. */
const flagged = (src) => {
  const lx = lex(src);
  return unescapedMarkupInterpolations(src, lx).map((i) => lx.lineOf(i));
};

describe('rule 21 (07 S1): templates written as markup are escaped', () => {
  test('flags an unescaped ${name} in an innerHTML template and passes the escaped one', () => {
    assert.deepEqual(flagged('el.innerHTML = `<b>${name}</b>`;'), [1]);
    assert.deepEqual(flagged('el.innerHTML = `<b>${escapeHtml(name)}</b>`;'), []);
  });

  test('every sink: =, +=, outerHTML and the markup argument of insertAdjacentHTML; each bad interpolation once', () => {
    const src = [
      'a.innerHTML += `${x}${escapeHtml(y)}${z}`;',
      'a.outerHTML = `<i>${x}</i>`;',
      "a.insertAdjacentHTML('beforeend', `<u>${x.name}</u>`);",
      "a.insertAdjacentHTML(`${pos}`, '<b>static</b>');",
    ].join('\n');
    assert.deepEqual(flagged(src), [1, 1, 2, 3]);
  });

  test('near misses: comments, plain strings, helper calls, textContent, nested templates inside escapeHtml', () => {
    const src = [
      '// el.innerHTML = `${name}`',
      "el.innerHTML = '<b>${name}</b>';",
      'el.innerHTML = cardHtml(section);',
      'el.textContent = `${name}`;',
      'el.innerHTML = `${escapeHtml(`${a}-${b}`)}`;',
      'if (el.innerHTML === `${x}`) f();',
    ].join('\n');
    assert.deepEqual(flagged(src), []);
  });

  test('the repository passes rule 21 (the ui templates of 08 P2-3a are escaped)', async () => {
    const result = await runChecks(REPO);
    assert.deepEqual(result.violations.filter((v) => v.rule === 21), []);
  });
});
