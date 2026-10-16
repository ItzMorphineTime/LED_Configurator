// The :root custom properties of css/02-tokens.css, for the token tests (docs/improvements/06-morph-branding.md 8.1:
// U4 parity and U6 gold exclusivity in theme.test.mjs, U5 contrast in contrast.test.mjs). Zero dependencies.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const TOKENS_FILE = join(ROOT, 'css', '02-tokens.css');

/**
 * The custom properties of the first `:root { ... }` block of a stylesheet, as written (comments removed, values
 * trimmed; a later declaration of the same name wins, as in CSS).
 * @param {string} css
 * @returns {Map<string, string>}
 */
export function rootDeclarations(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const block = /:root\s*\{([^}]*)\}/.exec(text);
  if (!block) throw new Error('no :root block');
  const decls = new Map();
  for (const m of block[1].matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]*);/g)) decls.set(m[1], m[2].trim());
  return decls;
}

/**
 * Resolves the var(--x) references of a declaration value against `decls`, like the computed value of a custom
 * property (var() substituted, the text otherwise as written). Depth <= 8; a cycle or an unknown name throws.
 * @param {Map<string, string>} decls
 * @param {string} name
 * @returns {string}
 */
export function resolveVar(decls, name, depth = 0, stack = []) {
  if (stack.includes(name)) throw new Error(`var() cycle: ${[...stack, name].join(' -> ')}`);
  if (depth > 8) throw new Error(`var() chain deeper than 8 at ${name}`);
  if (!decls.has(name)) throw new Error(`${name} is not declared`);
  return decls.get(name).replace(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g, (_, ref) => resolveVar(decls, ref, depth + 1, [...stack, name]));
}

/**
 * css/02-tokens.css read now: the declarations, a ThemeBridge-style reader ('' for an undeclared name, like
 * getPropertyValue) and `token(name)`, which throws for an undeclared name.
 * @returns {{decls: Map<string, string>, read: (name: string) => string, token: (name: string) => string}}
 */
export function readTokens() {
  const decls = rootDeclarations(readFileSync(TOKENS_FILE, 'utf8'));
  return {
    decls,
    read: (name) => (decls.has(name) ? resolveVar(decls, name) : ''),
    token: (name) => resolveVar(decls, name),
  };
}
