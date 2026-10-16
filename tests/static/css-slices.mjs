#!/usr/bin/env node
/**
 * @module tests/static/css-slices
 * Proves that the 12 stylesheets in css/ are contiguous slices of the original inline <style>
 * (index.html@cd3fd3f lines 12-869), in link order (docs/ARCHITECTURE.md 2.1, rule R8).
 * Zero dependencies.
 *
 * Usage:
 *   node tests/static/css-slices.mjs                 original read with `git show cd3fd3f:index.html`
 *   node tests/static/css-slices.mjs <original.html> original read from that path
 *   node tests/static/css-slices.mjs --report-only [<original.html>]
 *                                                    every check runs and every difference is printed (REPORT
 *                                                    lines), but the exit code is 0 (07 S7)
 *
 * Scope (07 S7, C52; since 01 F1-2): the slices are the stylesheets css/01-*.css to css/12-*.css. Nothing else under
 * css/ is a slice or is scanned: the feature stylesheets in css/features/ and the other numbered ranges of 07 C52's
 * link order (00-fonts, 20-29, 99-utilities).
 * Report-only (07 S7): since 06 T1, the first intentional change to the slices (it deleted the dead .grid-lines and
 * .section-color-0..7 rules), css/01-12 no longer equal the original by design, so the gate runs with --report-only:
 * the report documents how far the slices have moved from the original, and nothing fails on it. The script is kept,
 * not deleted.
 *
 * Checks:
 *   1. The regular files css/01-*.css .. css/12-*.css are exactly the 12 files of the 2.1 slice table (no more, no
 *      fewer).
 *   2. Normalised concatenation of css/01..12 equals normalised original lines 12-869.
 *      Normalising removes every comment and collapses each run of CSS whitespace (space, tab,
 *      LF, CR, FF) to one space, trimmed. Other Unicode spaces (U+00A0, ...) are not CSS
 *      whitespace (CSS reads them as identifier characters), so they are compared as written.
 *   3. Each file, normalised, equals its own original line range (rules never cross a file boundary).
 *   4. Only 12-responsive.css contains '@media' (it holds the only @media rule and is linked last).
 *   5. Each file starts with its one header comment and contains no other comment (2.1: "a header
 *      comment followed by the original lines"). The original has no comments, so a comment inside
 *      the body could only hide a change: a comment between `col` and `or` makes CSS read two
 *      tokens, while the normaliser, which deletes comments, would read `color`.
 * A single leading byte-order mark is ignored (the browser's decoder consumes it).
 * Exit code: 0 when every check passes, 1 when a check fails, 2 when the original cannot be read (or an argument is
 * unknown); with --report-only, 0 whenever the checks could run.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CSS_DIR = join(REPO_ROOT, 'css');
const LEGACY_COMMIT = 'cd3fd3f';
const STYLE_OPEN_LINE = 11;
const STYLE_CLOSE_LINE = 870;
const CONTEXT_CHARS = 80;

/** The binding slice table of docs/ARCHITECTURE.md 2.1: [file, first line, last line] (1-based, inclusive). */
const SLICES = Object.freeze([
  ['01-reset.css', 12, 16],
  ['02-tokens.css', 18, 31],
  ['03-layout.css', 33, 46],
  ['04-header.css', 48, 102],
  ['05-control-panel.css', 104, 295],
  ['06-controls.css', 297, 444],
  ['07-viewport.css', 446, 524],
  ['08-section-logos.css', 526, 602],
  ['09-viewport-tools.css', 604, 735],
  ['10-section-extras.css', 737, 811],
  ['11-export.css', 813, 857],
  ['12-responsive.css', 859, 869],
]);
const MEDIA_FILE = '12-responsive.css';
/** A file name in the slice range css/01-*.css .. css/12-*.css (07 S7: the only files this check scans). */
const SLICE_RANGE_RE = /^(0[1-9]|1[0-2])-.*\.css$/;

/**
 * Reads the original index.html, from a path or from git.
 * @param {string | undefined} path - optional path to a copy of index.html@cd3fd3f
 * @returns {string} the file text
 * Side effects: spawns `git show` when no path is given.
 */
function readOriginal(path) {
  if (path) return readFileSync(resolve(path), 'utf8');
  return execFileSync('git', ['show', `${LEGACY_COMMIT}:index.html`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Returns original lines `first`..`last` (1-based, inclusive) joined with '\n'.
 * @param {string[]} lines
 * @param {number} first
 * @param {number} last
 * @returns {string}
 */
function lineRange(lines, first, last) {
  return lines.slice(first - 1, last).join('\n');
}

/** A block comment (CSS has no line comments). */
const COMMENT_RE = /\/\*[\s\S]*?\*\//g;
/** The leading header comment of a slice file. */
const HEADER_RE = /^\/\*[\s\S]*?\*\//;

/**
 * Removes comments and collapses CSS whitespace runs to one space, trimmed.
 * Only CSS whitespace (space, tab, LF, CR, FF) collapses; JS `\s` would also swallow U+00A0 and
 * other Unicode spaces, which CSS treats as identifier characters, and so hide a real change.
 * @param {string} css
 * @returns {string}
 */
function normalise(css) {
  return css.replace(COMMENT_RE, '').replace(/[ \t\n\r\f]+/g, ' ').replace(/^ | $/g, '');
}

/**
 * Reads a slice file, dropping one leading byte-order mark.
 * @param {string} path
 * @returns {string}
 * Side effects: reads the file.
 */
function readSlice(path) {
  return readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
}

/**
 * Describes the first difference between two strings with context from each side.
 * @param {string} expected - normalised original
 * @param {string} actual - normalised slices
 * @returns {string | null} null when equal
 */
function describeDifference(expected, actual) {
  if (expected === actual) return null;
  let offset = 0;
  while (offset < expected.length && offset < actual.length && expected[offset] === actual[offset]) offset++;
  const start = Math.max(0, offset - CONTEXT_CHARS);
  const context = (s) => JSON.stringify(s.slice(start, offset + CONTEXT_CHARS));
  return [
    `first difference at normalised offset ${offset} (original length ${expected.length}, slices length ${actual.length})`,
    `  original: ${context(expected)}`,
    `  slices:   ${context(actual)}`,
  ].join('\n');
}

/**
 * Runs every check and reports the result on stdout/stderr.
 * @param {string | undefined} originalPath
 * @param {{reportOnly?: boolean}} [options]  reportOnly: print every difference as a REPORT line and return 0 (07 S7)
 * @returns {number} the process exit code
 * Side effects: reads css/ and the original; prints a report.
 */
function main(originalPath, { reportOnly = false } = {}) {
  let original;
  try {
    original = readOriginal(originalPath);
  } catch (error) {
    console.error(`css-slices: cannot read the original index.html: ${error.message}`);
    return 2;
  }
  const lines = original.split(/\r?\n/);
  const failures = [];

  if (lines[STYLE_OPEN_LINE - 1]?.trim() !== '<style>' || lines[STYLE_CLOSE_LINE - 1]?.trim() !== '</style>') {
    console.error(`css-slices: the original has no <style> at line ${STYLE_OPEN_LINE} and </style> at line ${STYLE_CLOSE_LINE}; is it index.html@${LEGACY_COMMIT}?`);
    return 2;
  }

  const expectedNames = SLICES.map(([name]) => name);
  let present;
  try {
    present = readdirSync(CSS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && SLICE_RANGE_RE.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    console.error(`css-slices: cannot list ${CSS_DIR}: ${error.message}`);
    return 1;
  }
  const missing = expectedNames.filter((name) => !present.includes(name));
  const extra = present.filter((name) => !expectedNames.includes(name));
  if (missing.length || extra.length) {
    failures.push(`css/01-*.css .. css/12-*.css must be exactly the 12 slice files; missing: [${missing.join(', ')}], unexpected: [${extra.join(', ')}]`);
  }

  const sources = new Map();
  for (const name of expectedNames) {
    if (!missing.includes(name)) sources.set(name, readSlice(join(CSS_DIR, name)));
  }

  for (const [name, source] of sources) {
    const header = source.match(HEADER_RE);
    if (!header) {
      failures.push(`${name} must start with its header comment`);
    } else if (source.slice(header[0].length).includes('/*')) {
      failures.push(`${name} contains a comment after its header; the body must be the original lines only`);
    }
  }

  if (missing.length === 0) {
    const expected = normalise(lineRange(lines, SLICES[0][1], SLICES[SLICES.length - 1][2]));
    const actual = normalise(expectedNames.map((name) => sources.get(name)).join('\n'));
    const difference = describeDifference(expected, actual);
    if (difference) failures.push(`concatenated css/01..12 differ from index.html@${LEGACY_COMMIT} lines 12-869:\n${difference}`);
  }

  for (const [name, first, last] of SLICES) {
    if (!sources.has(name)) continue;
    const difference = describeDifference(normalise(lineRange(lines, first, last)), normalise(sources.get(name)));
    if (difference) failures.push(`${name} differs from original lines ${first}-${last}:\n${difference}`);
  }

  for (const [name, source] of sources) {
    const hasMedia = source.includes('@media');
    if (name !== MEDIA_FILE && hasMedia) failures.push(`${name} contains '@media'; only ${MEDIA_FILE} may`);
    if (name === MEDIA_FILE && !normalise(source).includes('@media')) failures.push(`${MEDIA_FILE} must contain the @media rule`);
  }

  if (failures.length && reportOnly) {
    for (const failure of failures) console.log(`REPORT ${failure}`);
    console.log(`css-slices: report-only (07 S7): ${failures.length} difference(s) from the original slices reported; exit 0`);
    return 0;
  }
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    console.error(`css-slices: ${failures.length} check(s) failed`);
    return 1;
  }
  console.log(`css-slices: OK (12 files in css/ reproduce index.html@${LEGACY_COMMIT} lines 12-869 in link order; @media only in ${MEDIA_FILE})`);
  return 0;
}

/**
 * Parses the command line: `[--report-only] [<original.html>]`.
 * @param {string[]} args  process.argv.slice(2)
 * @returns {{originalPath: string | undefined, reportOnly: boolean} | null} null for an unknown option or a second path
 */
function parseArgs(args) {
  let originalPath;
  let reportOnly = false;
  for (const arg of args) {
    if (arg === '--report-only') reportOnly = true;
    else if (arg.startsWith('--') || originalPath !== undefined) return null;
    else originalPath = arg;
  }
  return { originalPath, reportOnly };
}

const parsed = parseArgs(process.argv.slice(2));
if (!parsed) {
  console.error('Usage: node tests/static/css-slices.mjs [--report-only] [<original.html>]');
  process.exitCode = 2;
} else {
  process.exitCode = main(parsed.originalPath, { reportOnly: parsed.reportOnly });
}
