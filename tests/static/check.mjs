#!/usr/bin/env node
/**
 * Static gate for the ES-module tree under js/ (docs/ARCHITECTURE.md 1.3-1.6, 4, 5.1, 8 and 10).
 * Zero dependencies, Node 22+.
 *
 *   node tests/static/check.mjs                 check <repo>/js
 *   node tests/static/check.mjs --root <dir>    check <dir>/js
 *   node tests/static/check.mjs --self-test     run against tests/static/fixtures/{good,bad}
 *
 * Every violation is printed as `file:line: [rule N] message`; the exit code is 1 if there is any,
 * else 0. Without a js/ directory the check prints "nothing to check" and exits 0. Every .js file
 * under js/ is checked; no file is exempt.
 *
 * Rules:
 *   1  import layering (the table in ARCHITECTURE.md 1.3; same-directory imports allowed, except
 *      that only js/main.js may import app/App.js)
 *   2  import specifiers are relative, end with '.js' and match the on-disk file names exactly
 *   3  the identifiers `window` and `document` only in js/vendor/, js/ui/dom.js, js/app/App.js, js/main.js
 *   4  DOM-id lookups (getElementById / querySelector('#id') / byId(doc, 'id') with a literal id)
 *      only in js/ui/ and js/app/App.js, each id in exactly one module, App.js with exactly its
 *      eight ids (01 F1-2 added #debug-normals-stats), #camera-preview-options owned by ui/CameraPanel.js
 *   5  no module-level `let` or `var`
 *   6  per file, the ids of its LEGACY(B-xx) comment tags equal the LEGACY_SITES ids for that file (8.3);
 *      a LEGACY_SITES site under js/ whose file does not exist is reported too
 *   7  every Events key is emitted and (except WALL_REBUILT) subscribed; every Events.X names a key
 *   8  every leaf of Strategies is referenced (`Strategies.<path>`, or `profile.<leaf>` under mesh.<consumer>.)
 *   9  js/core, legacy, theme, domain, geometry, io contain no THREE / document / window identifier
 *  10  domain fields are assigned outside js/domain/ only where the ALLOWLIST below permits it
 *  11  no numeric renderOrder literal >= 900 outside js/core/renderOrder.js, the render-order registry
 *      (docs/improvements/01-normals.md 5.5, CR-10; 07 S10): `x.renderOrder = 999` or `renderOrder: 995`
 *
 * "Identifier" means a token of code: comments and the text of string, template and regex literals
 * are blanked first (the code inside template `${...}` is kept), and a name after `.` or `?.` is a
 * property name, not an identifier.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Rule 10: the domain-field writes outside js/domain/ that ARCHITECTURE.md section 4 permits.
 * `receiver` is the last identifier before `.field` (a leading '#' removed).
 */
export const ALLOWLIST = Object.freeze([
    { file: 'js/app/WallController.js', receiver: 'project', field: 'meshMode' },
    { file: 'js/app/WallController.js', receiver: 'display', field: 'wireframe' },
    { file: 'js/app/WallController.js', receiver: 'display', field: 'showFrame' },
    { file: 'js/app/WallController.js', receiver: 'display', field: 'ledLayout' },
    { file: 'js/render/SceneManager.js', receiver: 'display', field: 'showGrid' },
    { file: 'js/app/CameraController.js', receiver: 'display', field: 'showSafeDistance' },
    { file: 'js/app/CameraController.js', receiver: 'cine', field: 'enabled' },
    { file: 'js/app/PropController.js', receiver: 'prop', field: 'visible' },
    // DebugViewSettings (01 F1-1): written only by the debug-view use cases.
    { file: 'js/app/DebugViewController.js', receiver: 'settings', field: 'shading' },
    { file: 'js/app/DebugViewController.js', receiver: 'normals', field: 'enabled' },
    { file: 'js/app/DebugViewController.js', receiver: 'normals', field: 'vertex' },
    { file: 'js/app/DebugViewController.js', receiver: 'normals', field: 'face' },
    { file: 'js/app/DebugViewController.js', receiver: 'normals', field: 'lengthScale' },
    { file: 'js/app/DebugViewController.js', receiver: 'normals', field: 'onTop' },
].map(Object.freeze));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const FIXTURES = path.join(HERE, 'fixtures');

const RULE_TITLES = Object.freeze({
    1: 'import layering',
    2: 'import specifier',
    3: 'window/document identifier',
    4: 'DOM-id lookup',
    5: 'module-level state',
    6: 'LEGACY parity',
    7: 'Events usage',
    8: 'Strategies reference',
    9: 'pure layer',
    10: 'domain field write',
    11: 'render order literal',
});

/**
 * Rule 1: the other layers each layer may import (ARCHITECTURE.md 1.3). An entry with a '/' is a
 * single file (relative to js/); any other entry is a whole layer directory. Every module may also
 * import its own layer directory.
 */
const LAYERS = Object.freeze({
    vendor: [],
    core: [],
    legacy: [],
    theme: [],
    domain: ['legacy'],
    geometry: ['domain', 'legacy'],
    io: ['domain', 'geometry', 'legacy'],
    render: ['vendor/three.js', 'core', 'legacy', 'domain', 'geometry'],
    interaction: ['vendor/three.js', 'core', 'legacy', 'render/ResourceTracker.js'],
    app: ['core', 'legacy', 'domain', 'geometry'],
    ui: ['core', 'legacy', 'domain'],
});
/** Modules that may import anything (the composition root and the entry). */
const UNRESTRICTED = new Set(['main.js', 'app/App.js']);

/** Rule 3: where `window` / `document` may appear (relative to js/; a trailing '/' is a directory). */
const GLOBALS_ALLOWED = ['vendor/', 'ui/dom.js', 'app/App.js', 'main.js'];
/** Rule 4: where DOM-id lookups may appear. */
const LOOKUPS_ALLOWED = ['ui/', 'app/App.js'];
/** Rule 4: App.js looks up exactly these ids (ARCHITECTURE.md 3.11, section 7): the canvas, the six preview-window ids,
 *  and the normal-line stats element it injects into NormalsDebugView (01 F1-2, 5.6). */
const APP_IDS = Object.freeze(['three-canvas', 'camera-preview-window', 'camera-preview-canvas', 'camera-preview-resize',
    'camera-preview-info', 'camera-preview-fov', 'camera-preview-res', 'debug-normals-stats']);
/** Rule 4: ids whose owner the contract names explicitly. */
const ID_OWNERS = Object.freeze({ 'camera-preview-options': 'ui/CameraPanel.js' });
/** Rule 9: the pure layers. */
const PURE_LAYERS = new Set(['core', 'legacy', 'theme', 'domain', 'geometry', 'io']);

/** Rule 10: the domain field names and the receivers that denote domain objects. */
const DOMAIN_FIELDS = Object.freeze(['posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'filmback', 'filmbackWidth', 'filmbackHeight',
    'focalLength', 'enabled', 'visible', 'scale', 'content', 'wireframe', 'showFrame', 'ledLayout', 'showGrid', 'showSafeDistance',
    'meshMode', 'nextSectionId', 'panelCols', 'panelRows', 'panelWidth', 'panelHeight', 'ledX', 'ledY', 'curveIntensity',
    'angleOffset', 'name', 'color', 'borderThickness', 'fontSize', 'fontColor', 'sectionLabelEnabled', 'sectionLabelFontSize',
    'sectionLabelColor', 'shading', 'vertex', 'face', 'lengthScale', 'onTop']);
const DOMAIN_RECEIVERS = new Set(['project', 'wall', 'section', 'sections[...]', 'cine', 'prop', 'person', 'car', 'display',
    'panelIdStyle', 'style', 'settings', 'normals']);
const ASSIGNMENT_OPS = ['>>>=', '**=', '<<=', '>>=', '&&=', '||=', '??=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '++', '--'];

/** Rule 11: the only file that may hold renderOrder literals of 900 and above (relative to js/). */
const RENDER_ORDER_FILE = 'core/renderOrder.js';
const RENDER_ORDER_MIN = 900;

/** Rule 7: the one event that may have no subscriber (the feature seam, ARCHITECTURE.md 5.1 rule 7). */
const UNSUBSCRIBED_EVENTS = new Set(['WALL_REBUILT']);

const startsWithAny = (rel, list) => list.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p));
const toPosix = (p) => p.split(path.sep).join('/');
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c === '\u00a0' || c === '\ufeff' || c === '\u2028' || c === '\u2029';
const isIdStart = (c) => c !== undefined && /[A-Za-z_$\u00aa-\uffff]/.test(c);
const isIdPart = (c) => c !== undefined && /[\w$\u00aa-\uffff]/.test(c);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- lexer ------------------------------------------------------------------------------------

/** After these keywords a '/' starts a regular expression, not a division. */
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do',
    'else', 'yield', 'await']);
/** Keywords whose parenthesised header is followed by a statement, so a '/' after its ')' starts a regex. */
const HEADER_KEYWORDS = new Set(['if', 'while', 'for', 'with']);

/**
 * Tokenise just enough JavaScript to separate code from comments and literal text.
 * @param {string} src module source
 * @returns {{code: string, noComments: string, comments: {text: string, start: number}[],
 *   strings: Map<number, {value: string, start: number, end: number, quote: string}>, lineOf: (index: number) => number}}
 *   `code`: comments and the contents of string/template/regex literals replaced by spaces (quotes,
 *   backticks and the code inside `${...}` kept; newlines kept, so offsets and lines are unchanged);
 *   `noComments`: only the comments blanked; `strings`: string literals and substitution-free
 *   template literals keyed by the offset of their opening quote.
 */
export function lex(src) {
    const n = src.length;
    const code = src.split('');
    const noComments = src.split('');
    const comments = [];
    const strings = new Map();
    const blank = (arr, a, b) => { for (let k = a; k < b; k++) if (arr[k] !== '\n' && arr[k] !== '\r') arr[k] = ' '; };
    const templateDepths = [];   // brace depth at each open `${`
    const parenIsHeader = [];    // per open '(': true when it opens an if/while/for/with header
    let depth = 0;               // { } nesting, to find the `}` that closes a template substitution
    let prev = 'start';          // previous significant token: 'word' | 'keyword' | 'header' | 'value' | 'punct' | 'start'
    let i = 0;
    if (src.startsWith('#!')) {
        i = src.indexOf('\n') < 0 ? n : src.indexOf('\n');
        blank(code, 0, i);
        blank(noComments, 0, i);
    }

    /** Template text from j (after '`' or after the '}' of a substitution) up to '`' or '${'. */
    const templateText = (j) => {
        const from = j;
        while (j < n) {
            const c = src[j];
            if (c === '\\') { j += 2; continue; }
            if (c === '`') { blank(code, from, j); return { end: j + 1, closed: true }; }
            if (c === '$' && src[j + 1] === '{') { blank(code, from, j); templateDepths.push(depth); return { end: j + 2, closed: false }; }
            j++;
        }
        blank(code, from, n);
        return { end: n, closed: true };
    };

    /** End offset (after the flags) of a regular expression literal starting at j, or -1. */
    const regexEnd = (j) => {
        let inClass = false;
        for (j += 1; j < n; j++) {
            const c = src[j];
            if (c === '\n' || c === '\r') return -1;
            if (c === '\\') { j++; continue; }
            if (inClass) { if (c === ']') inClass = false; } else if (c === '[') inClass = true;
            else if (c === '/') { j++; while (j < n && /[a-z]/i.test(src[j])) j++; return j; }
        }
        return -1;
    };

    while (i < n) {
        const c = src[i];
        if (isSpace(c)) { i++; continue; }
        if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) {
            const line = src[i + 1] === '/';
            const close = line ? src.indexOf('\n', i) : src.indexOf('*/', i + 2);
            const end = close < 0 ? n : line ? close : close + 2;
            comments.push({ text: src.slice(i, end), start: i });
            blank(code, i, end);
            blank(noComments, i, end);
            i = end;
            continue;
        }
        if (c === '"' || c === "'") {
            let j = i + 1;
            while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
            const end = Math.min(j + 1, n);
            strings.set(i, { value: src.slice(i + 1, j), start: i, end, quote: c });
            blank(code, i + 1, j);
            i = end;
            prev = 'value';
            continue;
        }
        if (c === '`') {
            const t = templateText(i + 1);
            if (t.closed) strings.set(i, { value: src.slice(i + 1, t.end - 1), start: i, end: t.end, quote: '`' });
            i = t.end;
            prev = t.closed ? 'value' : 'punct';
            continue;
        }
        if (c === '}' && templateDepths.length && templateDepths[templateDepths.length - 1] === depth) {
            templateDepths.pop();
            const t = templateText(i + 1);
            i = t.end;
            prev = t.closed ? 'value' : 'punct';
            continue;
        }
        if (c === '{') { depth++; prev = 'punct'; i++; continue; }
        if (c === '}') { depth--; prev = 'value'; i++; continue; }
        if (c === '/') {
            if (prev !== 'word' && prev !== 'value') {
                const end = regexEnd(i);
                if (end > 0) { blank(code, i + 1, end); i = end; prev = 'value'; continue; }
            }
            prev = 'punct';
            i++;
            continue;
        }
        if (isIdStart(c) || (c === '#' && isIdStart(src[i + 1]))) {
            let j = i + 1;
            while (j < n && isIdPart(src[j])) j++;
            const word = src.slice(i, j);
            let k = i - 1;
            while (k >= 0 && isSpace(src[k])) k--;
            const isProperty = src[k] === '.' && src.slice(k - 2, k + 1) !== '...';
            prev = isProperty ? 'word' : HEADER_KEYWORDS.has(word) ? 'header' : REGEX_AFTER_WORD.has(word) ? 'keyword' : 'word';
            i = j;
            continue;
        }
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
            let j = i + 1;
            while (j < n && /[\w.]/.test(src[j])) j++;
            i = j;
            prev = 'value';
            continue;
        }
        if (c === '(') parenIsHeader.push(prev === 'header');
        // `if (x) /re/.test(s)`: after a statement header's ')' a '/' starts a regex; after any other ')' it divides.
        if (c === ')') prev = parenIsHeader.pop() ? 'punct' : 'value';
        else prev = c === ']' ? 'value' : 'punct';
        i++;
    }

    const lineStarts = [0];
    for (let k = 0; k < n; k++) if (src[k] === '\n') lineStarts.push(k + 1);
    const lineOf = (index) => {
        let lo = 0, hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= index) lo = mid; else hi = mid - 1;
        }
        return lo + 1;
    };
    return { code: code.join(''), noComments: noComments.join(''), comments, strings, lineOf };
}

// ---- small code-walking helpers ------------------------------------------------------------------

/** Offset of the previous non-space character before `index` (or -1). */
function prevNonSpace(code, index) {
    let k = index - 1;
    while (k >= 0 && isSpace(code[k])) k--;
    return k;
}

/** Offset of the next non-space character at or after `index`. */
function nextNonSpace(code, index) {
    let k = index;
    while (k < code.length && isSpace(code[k])) k++;
    return k;
}

/** True when the name starting at `index` is a property name (after `.` or `?.`, not after a spread `...`). */
function isPropertyName(code, index) {
    const k = prevNonSpace(code, index);
    return k >= 0 && code[k] === '.' && code.slice(k - 2, k + 1) !== '...';
}

/** The identifier (with a leading '#') that ends at offset `end` (inclusive), or null. */
function identifierEndingAt(code, end) {
    let j = end;
    while (j >= 0 && isIdPart(code[j])) j--;
    if (code[j] === '#') j--;
    const name = code.slice(j + 1, end + 1);
    if (!name || name === '#' || /^#?[0-9]/.test(name)) return null;
    return { name, start: j + 1 };
}

/** Offset of the bracket that opens the one closing at `close` (scanning backwards), or -1. */
function matchingOpen(code, close) {
    const pairs = { ')': '(', ']': '[', '}': '{' };
    let d = 0;
    for (let k = close; k >= 0; k--) {
        if (code[k] === ')' || code[k] === ']' || code[k] === '}') d++;
        else if (code[k] === '(' || code[k] === '[' || code[k] === '{') {
            d--;
            if (d === 0) return code[k] === pairs[code[close]] ? k : -1;
        }
    }
    return -1;
}

/** Start offset of the member chain (`a.b[c].d(e).f`) whose last `.` is at `dot`. */
function memberChainStart(code, dot) {
    let start = dot;
    let k = prevNonSpace(code, dot);
    for (;;) {
        if (k < 0) return start;
        if (code[k] === ']' || code[k] === ')') {
            const open = matchingOpen(code, k);
            if (open < 0) return start;
            start = open;
            k = prevNonSpace(code, open);
            continue;
        }
        const id = identifierEndingAt(code, k);
        if (!id) return start;
        start = id.start;
        const before = prevNonSpace(code, id.start);
        if (before >= 0 && code[before] === '.' && code.slice(before - 2, before + 1) !== '...') {
            k = prevNonSpace(code, code[before - 1] === '?' ? before - 1 : before);
            continue;
        }
        return start;
    }
}

/** Index just after the top-level comma of an argument list that starts at `from`, or -1. */
function nextArgument(code, from) {
    let d = 0;
    for (let k = from; k < code.length; k++) {
        const c = code[k];
        if (c === '(' || c === '[' || c === '{') d++;
        else if (c === ')' || c === ']' || c === '}') { if (d === 0) return -1; d--; } else if (c === ',' && d === 0) return k + 1;
    }
    return -1;
}

/** The string literal that forms a whole argument starting at `from` (followed by ')' or ','), or null. */
function literalArgument(lx, from) {
    const s = lx.strings.get(nextNonSpace(lx.code, from));
    if (!s) return null;
    const after = lx.code[nextNonSpace(lx.code, s.end)];
    return after === ')' || after === ',' ? s : null;
}

/** All `window` / `document` / `THREE` identifier tokens of a module (property names excluded). */
function identifierTokens(lx, names) {
    const re = new RegExp(`(?<![\\w$#])(${names.map(escapeRe).join('|')})(?![\\w$])`, 'g');
    return [...lx.code.matchAll(re)].filter((m) => !isPropertyName(lx.code, m.index)).map((m) => ({ name: m[1], index: m.index }));
}

// ---- file discovery ---------------------------------------------------------------------------

function listJsFiles(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...listJsFiles(p));
        else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

const dirCache = new Map();
function dirEntries(dir) {
    if (!dirCache.has(dir)) {
        let names = null;
        try { names = fs.readdirSync(dir); } catch { names = null; }
        dirCache.set(dir, names);
    }
    return dirCache.get(dir);
}

/**
 * Check that every segment of `target` below `base` exists with exactly this spelling.
 * @returns {string|null} a problem description, or null when the path matches the disk exactly
 */
function caseExactProblem(base, target) {
    const segments = toPosix(path.relative(base, target)).split('/');
    let dir = base;
    for (const seg of segments) {
        const names = dirEntries(dir);
        if (!names) return `does not exist (${toPosix(path.relative(base, dir)) || '.'} is not a directory)`;
        if (!names.includes(seg)) {
            const other = names.find((nm) => nm.toLowerCase() === seg.toLowerCase());
            return other ? `case differs from the file on disk: '${seg}' vs '${other}'` : 'does not exist';
        }
        dir = path.join(dir, seg);
    }
    return null;
}

/** Import a module of the checked tree; reports a violation when it exists but fails to load. */
async function importIfPresent(root, rel, rule, ctx) {
    const abs = path.join(root, ...rel.split('/'));
    if (!fs.existsSync(abs)) return { missing: true };
    try {
        return { module: await import(pathToFileURL(abs).href) };
    } catch (e) {
        ctx.report(rel, 1, rule, `could not import ${rel}: ${String(e && e.message || e).split('\n')[0]}`);
        return { failed: true };
    }
}

// ---- rules ------------------------------------------------------------------------------------

const IMPORT_RE = /(?<![\w$.])import\s*(?:[\w$*{}\s,]+?\s*from\s*)?(['"])/g;
const EXPORT_FROM_RE = /(?<![\w$.])export\s*(?:\*\s*(?:as\s+[\w$]+\s*)?|\{[^}]*\}\s*)from\s*(['"])/g;

/** Rules 1 and 2: static import / re-export specifiers. */
function checkImports(mod, ctx) {
    const { lx } = mod;
    const found = [...lx.code.matchAll(IMPORT_RE), ...lx.code.matchAll(EXPORT_FROM_RE)];
    for (const m of found) {
        const quote = m.index + m[0].length - 1;
        const lit = lx.strings.get(quote);
        if (!lit) continue;
        const spec = lit.value;
        const line = lx.lineOf(quote);
        if (!spec.startsWith('./') && !spec.startsWith('../')) {
            ctx.report(mod.rel, line, 2, `import specifier '${spec}' must be relative ('./' or '../')`);
            continue;
        }
        if (!spec.endsWith('.js')) {
            ctx.report(mod.rel, line, 2, `import specifier '${spec}' must end with '.js'`);
            continue;
        }
        const target = path.resolve(path.dirname(mod.abs), ...spec.split('/'));
        const toRel = toPosix(path.relative(ctx.jsRoot, target));
        if (toRel.startsWith('../') || path.isAbsolute(toRel)) {
            ctx.report(mod.rel, line, 1, `'${spec}' resolves outside js/`);
            continue;
        }
        const problem = caseExactProblem(ctx.jsRoot, target);
        if (problem) ctx.report(mod.rel, line, 2, `import '${spec}' (js/${toRel}) ${problem}`);
        const layerProblem = layeringProblem(mod.jsRel, toRel);
        if (layerProblem) ctx.report(mod.rel, line, 1, layerProblem);
    }
}

const layerOf = (jsRel) => (jsRel.includes('/') ? jsRel.slice(0, jsRel.indexOf('/')) : null);

/** Rule 1 for one import edge (both paths relative to js/). */
function layeringProblem(fromRel, toRel) {
    if (fromRel === 'main.js') return null;
    if (toRel === 'app/App.js') return `only js/main.js may import app/App.js`;
    if (UNRESTRICTED.has(fromRel)) return null;
    const from = layerOf(fromRel);
    if (!from || !LAYERS[from]) return `js/${fromRel} is not in a known layer directory (ARCHITECTURE.md 1.3)`;
    const to = layerOf(toRel);
    if (to === from) return null;
    if (LAYERS[from].includes(toRel) || (to && LAYERS[from].includes(to))) return null;
    const allowed = LAYERS[from].length ? LAYERS[from].join(', ') : 'no other layer';
    return `${from}/ may not import js/${toRel} (may import its own directory and: ${allowed})`;
}

/** Rules 3 and 9: `window` / `document` / `THREE` identifiers. */
function checkGlobals(mod, ctx) {
    const { lx } = mod;
    const pure = PURE_LAYERS.has(layerOf(mod.jsRel));
    const globalsAllowed = startsWithAny(mod.jsRel, GLOBALS_ALLOWED);
    for (const t of identifierTokens(lx, ['window', 'document', 'THREE'])) {
        const line = lx.lineOf(t.index);
        if (t.name !== 'THREE' && !globalsAllowed) {
            ctx.report(mod.rel, line, 3, `'${t.name}' identifier: only js/vendor/, js/ui/dom.js, js/app/App.js and js/main.js may use it (inject doc/win)`);
        }
        if (pure) ctx.report(mod.rel, line, 9, `'${t.name}' identifier in the pure layer ${layerOf(mod.jsRel)}/ (THREE-free, DOM-free)`);
    }
}

const LOOKUP_RE = /(?<![\w$#])(getElementById|querySelectorAll|querySelector)\s*\(/g;
const BYID_RE = /(?<![\w$#])byId\s*\(/g;
const ID_SELECTOR_RE = /^#([A-Za-z_][\w-]*)$/;

/** Rule 4, collection: every DOM-id lookup with a literal id. */
function collectLookups(mod, ctx) {
    const { lx } = mod;
    const add = (id, index, via) => ctx.lookups.push({ id, file: mod.rel, jsRel: mod.jsRel, line: lx.lineOf(index), via });
    for (const m of lx.code.matchAll(LOOKUP_RE)) {
        const lit = literalArgument(lx, m.index + m[0].length);
        if (!lit) continue;
        if (m[1] === 'getElementById') add(lit.value, m.index, m[1]);
        else {
            const sel = ID_SELECTOR_RE.exec(lit.value);
            if (sel) add(sel[1], m.index, m[1]);
        }
    }
    for (const m of lx.code.matchAll(BYID_RE)) {
        const second = nextArgument(lx.code, m.index + m[0].length);
        if (second < 0) continue;
        const lit = literalArgument(lx, second);
        if (lit) add(lit.value, m.index, 'byId');
    }
}

/** Rule 4, evaluation over all modules. */
function checkLookups(ctx) {
    const byId = new Map();
    for (const l of ctx.lookups) {
        if (!startsWithAny(l.jsRel, LOOKUPS_ALLOWED)) {
            ctx.report(l.file, l.line, 4, `DOM-id lookup of '#${l.id}' (${l.via}) outside js/ui/ and js/app/App.js`);
        }
        if (!byId.has(l.id)) byId.set(l.id, new Map());
        const files = byId.get(l.id);
        if (!files.has(l.file)) files.set(l.file, l);
    }
    for (const [id, files] of byId) {
        if (files.size > 1) {
            for (const l of files.values()) ctx.report(l.file, l.line, 4, `id '${id}' is looked up by ${files.size} modules (${[...files.keys()].join(', ')}); each id has exactly one owner`);
        }
        const owner = ID_OWNERS[id];
        if (owner) {
            for (const l of files.values()) if (l.jsRel !== owner) ctx.report(l.file, l.line, 4, `id '${id}' belongs to js/${owner}`);
        }
    }
    const app = ctx.modules.find((m) => m.jsRel === 'app/App.js');
    if (app) {
        const appIds = new Map(ctx.lookups.filter((l) => l.jsRel === 'app/App.js').map((l) => [l.id, l.line]));
        for (const id of APP_IDS) if (!appIds.has(id)) ctx.report(app.rel, 1, 4, `App.js must look up '${id}' (it looks up exactly: ${APP_IDS.join(', ')})`);
        for (const [id, line] of appIds) if (!APP_IDS.includes(id)) ctx.report(app.rel, line, 4, `App.js may look up only ${APP_IDS.join(', ')}; '${id}' belongs to a ui/ panel`);
    }
}

/** Rule 5: no `let` / `var` at module top level. */
function checkModuleState(mod, ctx) {
    const { code } = mod.lx;
    const depthAt = new Int32Array(code.length + 1);
    let d = 0;
    for (let k = 0; k < code.length; k++) {
        depthAt[k] = d;
        const c = code[k];
        if (c === '(' || c === '[' || c === '{') d++;
        else if (c === ')' || c === ']' || c === '}') d--;
    }
    for (const m of code.matchAll(/(?<![\w$.#])(let|var)(?![\w$])/g)) {
        if (depthAt[m.index] === 0 && !isPropertyName(code, m.index)) {
            ctx.report(mod.rel, mod.lx.lineOf(m.index), 5, `module-level '${m[1]}': no mutable module state (use a class field or a const)`);
        }
    }
}

/**
 * A LEGACY tag: `LEGACY(` + comma-separated bug ids + `)`. Whitespace between the parts may include the
 * `*` of a JSDoc continuation line, so a tag wrapped inside a block comment is still one tag.
 */
const TAG_RE = /LEGACY\([\s*]*(B-[HML]\d+(?:[\s*]*,[\s*]*B-[HML]\d+)*)[\s*]*\)/g;

/** Rule 6: LEGACY tags of each file against LEGACY_SITES. */
function checkLegacyTags(ctx, sites) {
    const legacyRel = 'js/legacy/LegacyCompat.js';
    const legacyMod = ctx.modules.find((m) => m.rel === legacyRel);
    const lineInLegacy = (text) => {
        if (!legacyMod) return 1;
        const k = legacyMod.src.indexOf(text);
        return k < 0 ? 1 : legacyMod.lx.lineOf(k);
    };
    if (!Array.isArray(sites)) {
        ctx.report(legacyRel, 1, 6, 'LEGACY_SITES must be an exported array of { id, site, behaviour, fix }');
        return;
    }
    const expected = new Map();   // file -> Map(id -> site)
    for (const [k, s] of sites.entries()) {
        if (!s || typeof s.site !== 'string' || typeof s.id !== 'string' || !/^B-[HML]\d+$/.test(s.id)) {
            ctx.report(legacyRel, 1, 6, `LEGACY_SITES[${k}] is not { id: 'B-xx', site: '...', ... }`);
            continue;
        }
        const hash = s.site.indexOf('#');
        if (!s.site.startsWith('js/') || hash < 0) continue;   // documentation-only entries (css/, index.html)
        const file = s.site.slice(0, hash);
        if (!expected.has(file)) expected.set(file, new Map());
        expected.get(file).set(s.id, s.site);
    }
    for (const file of expected.keys()) {
        if (!ctx.modules.some((m) => m.rel === file)) {
            ctx.report(legacyRel, lineInLegacy(`'${file}#`), 6, `LEGACY_SITES names ${file}, which does not exist`);
        }
    }
    for (const mod of ctx.modules) {
        const tags = new Map();   // id -> first line
        for (const c of mod.lx.comments) {
            for (const m of c.text.matchAll(TAG_RE)) {
                for (const id of m[1].match(/B-[HML]\d+/g)) {
                    if (!tags.has(id)) tags.set(id, mod.lx.lineOf(c.start + m.index));
                }
            }
        }
        const want = expected.get(mod.rel) || new Map();
        for (const [id, site] of want) if (!tags.has(id)) ctx.report(mod.rel, 1, 6, `missing LEGACY(${id}) tag (LEGACY_SITES: ${site})`);
        for (const [id, line] of tags) if (!want.has(id)) ctx.report(mod.rel, line, 6, `LEGACY(${id}) tag without a LEGACY_SITES entry for ${mod.rel} (ARCHITECTURE.md 8.3)`);
    }
}

/** Rule 7: Events keys emitted, subscribed and spelled correctly. */
function checkEvents(ctx, events) {
    const busRel = 'js/core/EventBus.js';
    const busMod = ctx.modules.find((m) => m.rel === busRel);
    const keyLine = (key) => {
        if (!busMod) return 1;
        const m = new RegExp(`(?<![\\w$])${escapeRe(key)}\\s*:`).exec(busMod.lx.code);
        return m ? busMod.lx.lineOf(m.index) : 1;
    };
    if (!events || typeof events !== 'object') {
        ctx.report(busRel, 1, 7, 'EventBus.js must export the Events catalogue object');
        return;
    }
    const keys = new Set(Object.keys(events));
    const emitted = new Set();
    const subscribed = new Set();
    for (const mod of ctx.modules) {
        const { code } = mod.lx;
        for (const m of code.matchAll(/(?<![\w$])emit\s*\(\s*Events\s*\.\s*([A-Za-z_$][\w$]*)/g)) emitted.add(m[1]);
        for (const m of code.matchAll(/(?<![\w$])on\s*\(\s*Events\s*\.\s*([A-Za-z_$][\w$]*)/g)) subscribed.add(m[1]);
        for (const m of code.matchAll(/(?<![\w$#])Events\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
            if (!isPropertyName(code, m.index) && !keys.has(m[1])) ctx.report(mod.rel, mod.lx.lineOf(m.index), 7, `Events.${m[1]} is not a key of the Events catalogue`);
        }
    }
    for (const key of keys) {
        if (!emitted.has(key)) ctx.report(busRel, keyLine(key), 7, `Events.${key} is never emitted (no emit(Events.${key}, ...))`);
        if (!subscribed.has(key) && !UNSUBSCRIBED_EVENTS.has(key)) ctx.report(busRel, keyLine(key), 7, `Events.${key} has no subscriber (no on(Events.${key}, ...))`);
    }
}

/** Leaf key paths of a Strategies object (arrays are leaves). */
function leafPaths(obj, prefix = []) {
    const out = [];
    for (const [k, v] of Object.entries(obj)) {
        const p = [...prefix, k];
        if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...leafPaths(v, p)); else out.push(p);
    }
    return out;
}

/** Rule 8: every Strategies leaf referenced outside comments in a file other than LegacyCompat.js. */
function checkStrategies(ctx, strategies) {
    const legacyRel = 'js/legacy/LegacyCompat.js';
    const legacyMod = ctx.modules.find((m) => m.rel === legacyRel);
    if (!strategies || typeof strategies !== 'object') {
        ctx.report(legacyRel, 1, 8, 'LegacyCompat.js must export the Strategies object');
        return;
    }
    const texts = ctx.modules.filter((m) => m.rel !== legacyRel).map((m) => m.lx.noComments);
    for (const p of leafPaths(strategies)) {
        const full = new RegExp(`(?<![\\w$])Strategies\\.${p.map(escapeRe).join('\\.')}(?![\\w$])`);
        const viaProfile = p.length === 3 && p[0] === 'mesh' ? new RegExp(`(?<![\\w$])profile\\.${escapeRe(p[2])}(?![\\w$])`) : null;
        if (texts.some((t) => full.test(t) || (viaProfile && viaProfile.test(t)))) continue;
        let line = 1;
        if (legacyMod) {
            const m = new RegExp(`(?<![\\w$])${escapeRe(p[p.length - 1])}\\s*:`).exec(legacyMod.lx.code);
            if (m) line = legacyMod.lx.lineOf(m.index);
        }
        const hint = p[0] === 'mesh' && p.length === 3 ? ` or profile.${p[2]}` : '';
        ctx.report(legacyRel, line, 8, `Strategies.${p.join('.')} is never referenced (no Strategies.${p.join('.')}${hint} outside comments, ARCHITECTURE.md 8.1)`);
    }
}

const FIELD_RE = new RegExp(`\\.\\s*(${DOMAIN_FIELDS.join('|')})(?![\\w$])`, 'g');

/** The receiver of `.field` at `dot` (ARCHITECTURE.md rule 10 definition), or null. */
function receiverAt(code, dot) {
    let k = prevNonSpace(code, dot);
    if (k < 0) return null;
    if (code[k] === ']') {
        const open = matchingOpen(code, k);
        if (open < 0) return null;
        const id = identifierEndingAt(code, prevNonSpace(code, open));
        return id ? { name: `${id.name.replace(/^#/, '')}[...]`, start: id.start } : null;
    }
    const id = identifierEndingAt(code, k);
    return id ? { name: id.name.replace(/^#/, ''), start: id.start } : null;
}

/** `style` is a PanelIdStyle receiver only as a bare identifier or as `this.style` / `this.#style`. */
function isPanelIdStyle(code, recv) {
    const before = prevNonSpace(code, recv.start);
    if (before < 0 || code[before] !== '.' || code.slice(before - 2, before + 1) === '...') return true;
    const owner = identifierEndingAt(code, prevNonSpace(code, code[before - 1] === '?' ? before - 1 : before));
    return !!owner && owner.name === 'this';
}

/** Rule 10: domain field writes outside js/domain/. */
function checkDomainWrites(mod, ctx) {
    if (mod.jsRel.startsWith('domain/')) return;
    const { code } = mod.lx;
    for (const m of code.matchAll(FIELD_RE)) {
        const dot = m.index;
        if (code[dot - 1] === '?' || code[dot - 1] === '.') continue;   // optional chain or spread: not an assignment target
        const field = m[1];
        const after = nextNonSpace(code, dot + m[0].length);
        let write = ASSIGNMENT_OPS.some((op) => code.startsWith(op, after))
            || (code[after] === '=' && code[after + 1] !== '=' && code[after + 1] !== '>');
        if (!write) {
            const p = prevNonSpace(code, memberChainStart(code, dot));
            write = p >= 1 && (code.slice(p - 1, p + 1) === '++' || code.slice(p - 1, p + 1) === '--');
        }
        if (!write) continue;
        const recv = receiverAt(code, dot);
        if (!recv || !DOMAIN_RECEIVERS.has(recv.name)) continue;
        if (recv.name === 'style' && !isPanelIdStyle(code, recv)) continue;   // a DOM CSSStyleDeclaration
        if (ALLOWLIST.some((a) => a.file === mod.rel && a.receiver === recv.name && a.field === field)) continue;
        ctx.report(mod.rel, mod.lx.lineOf(dot), 10, `write to ${recv.name}.${field} outside js/domain/ (not in the check.mjs ALLOWLIST; ARCHITECTURE.md section 4)`);
    }
}

/** A numeric literal token (decimal, exponent, hex, binary, octal; numeric separators allowed). */
const NUMBER_TOKEN_RE = /(?<![\w$.])(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)(?![\w$])/g;

/**
 * Rule 11: `renderOrder` assignments and object-literal properties whose right-hand side (up to the end of the
 * statement or property: `;`, `,` or `}` at its own depth, or the end of the line) contains a numeric literal
 * >= 900. Comments and string contents are already blanked, so only code counts.
 */
function checkRenderOrder(mod, ctx) {
    if (mod.jsRel === RENDER_ORDER_FILE) return;
    const { code } = mod.lx;
    for (const m of code.matchAll(/(?<![\w$])renderOrder(?![\w$])/g)) {
        let k = nextNonSpace(code, m.index + m[0].length);
        if (k < 0) continue;
        if (code[k] === '=' && code[k + 1] !== '=' && code[k + 1] !== '>') k++;
        else if (code[k] === ':') k++;
        else continue;
        let depth = 0;
        let end = k;
        for (; end < code.length; end++) {
            const c = code[end];
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
            else if ((c === ';' || c === ',') && depth === 0) break;
            else if (c === '\n' && depth === 0) break;
        }
        const rhs = code.slice(k, end);
        for (const n of rhs.matchAll(NUMBER_TOKEN_RE)) {
            // A unary minus (after an operator, a bracket or the start of the expression) makes the literal negative.
            const before = rhs.slice(0, n.index).trimEnd();
            const negative = before.endsWith('-') && !/[\w$)\]]$/.test(before.slice(0, -1).trimEnd());
            const value = (negative ? -1 : 1) * Number(n[0].replace(/_/g, ''));
            if (value >= RENDER_ORDER_MIN) {
                ctx.report(mod.rel, mod.lx.lineOf(m.index), 11, `renderOrder literal ${n[0]} (>= ${RENDER_ORDER_MIN}) outside js/${RENDER_ORDER_FILE}: use a RENDER_ORDER slot (01 5.5)`);
            }
        }
    }
}

// ---- runner -----------------------------------------------------------------------------------

/**
 * Run every rule against `<rootDir>/js`.
 * @param {string} rootDir the directory that contains js/
 * @returns {Promise<{nothingToCheck: boolean, files: number, violations: {file: string, line: number, rule: number, message: string}[], notices: string[]}>}
 */
export async function runChecks(rootDir) {
    const root = path.resolve(rootDir);
    const jsRoot = path.join(root, 'js');
    if (!fs.existsSync(jsRoot) || !fs.statSync(jsRoot).isDirectory()) return { nothingToCheck: true, files: 0, violations: [], notices: [] };
    dirCache.clear();

    const modules = listJsFiles(jsRoot).map((abs) => {
        const rel = toPosix(path.relative(root, abs));
        const src = fs.readFileSync(abs, 'utf8');
        return { abs, rel, jsRel: rel.slice('js/'.length), src, lx: lex(src) };
    });

    const violations = [];
    const notices = [];
    const ctx = {
        root, jsRoot, modules, lookups: [], notices,
        report: (file, line, rule, message) => violations.push({ file, line, rule, message }),
    };

    for (const mod of modules) {
        checkImports(mod, ctx);
        checkGlobals(mod, ctx);
        collectLookups(mod, ctx);
        checkModuleState(mod, ctx);
        checkDomainWrites(mod, ctx);
        checkRenderOrder(mod, ctx);
    }
    checkLookups(ctx);

    const legacy = await importIfPresent(root, 'js/legacy/LegacyCompat.js', 6, ctx);
    if (legacy.missing) notices.push('js/legacy/LegacyCompat.js not found: rules 6 (LEGACY parity) and 8 (Strategies references) skipped');
    if (legacy.module) {
        checkLegacyTags(ctx, legacy.module.LEGACY_SITES);
        checkStrategies(ctx, legacy.module.Strategies);
    }
    const bus = await importIfPresent(root, 'js/core/EventBus.js', 7, ctx);
    if (bus.missing) notices.push('js/core/EventBus.js not found: rule 7 (Events usage) skipped');
    if (bus.module) checkEvents(ctx, bus.module.Events);

    violations.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.rule - b.rule));
    return { nothingToCheck: false, files: modules.length, violations, notices };
}

const formatViolation = (v) => `${v.file}:${v.line}: [rule ${v.rule}] ${v.message}`;

// ---- self-test --------------------------------------------------------------------------------

/**
 * Violations the bad fixture tree must produce (file, rule, message fragment): each sub-case of each
 * rule, so a regression in one detector is caught even when the rule still fires elsewhere.
 */
const EXPECTED_BAD = Object.freeze([
    ['js/domain/Wall.js', 1, 'may not import js/render/LEDWallView.js'],
    ['js/render/LEDWallView.js', 1, 'may not import js/vendor/jszip.js'],
    ['js/interaction/Gizmo.js', 1, 'may not import js/render/LEDWallView.js'],
    ['js/app/WallController.js', 1, 'only js/main.js may import app/App.js'],
    ['js/domain/Thing.js', 1, 'resolves outside js/'],
    ['js/domain/Thing.js', 2, "'three' must be relative"],
    ['js/domain/Thing.js', 2, "'./Wall' must end with '.js'"],
    ['js/domain/Thing.js', 2, "case differs from the file on disk: 'wall.js' vs 'Wall.js'"],
    ['js/domain/Thing.js', 2, 'Missing.js) does not exist'],
    ['js/geometry/WallLayout.js', 3, "'document' identifier"],
    ['js/interaction/Gizmo.js', 3, "'window' identifier"],
    ['js/interaction/Gizmo.js', 3, "'document' identifier"],
    ['js/render/LEDWallView.js', 4, "lookup of '#three-canvas' (getElementById) outside"],
    ['js/render/LEDWallView.js', 4, "id 'three-canvas' is looked up by 2 modules"],
    ['js/ui/PanelA.js', 4, "id 'shared-id' is looked up by 2 modules"],
    ['js/ui/PanelB.js', 4, "id 'shared-id' is looked up by 2 modules"],
    ['js/ui/PanelB.js', 4, "id 'camera-preview-options' belongs to js/ui/CameraPanel.js"],
    ['js/app/App.js', 4, "App.js must look up 'camera-preview-window'"],
    ['js/app/App.js', 4, "'extra-id' belongs to a ui/ panel"],
    ['js/render/LEDWallView.js', 5, "module-level 'let'"],
    ['js/render/LEDWallView.js', 5, "module-level 'var'"],
    ['js/legacy/LegacyCompat.js', 6, 'missing LEGACY(B-L9) tag'],
    ['js/legacy/LegacyCompat.js', 6, 'LEGACY_SITES names js/app/Gone.js, which does not exist'],
    ['js/domain/Wall.js', 6, 'LEGACY(B-L2) tag without a LEGACY_SITES entry'],
    ['js/domain/Wall.js', 6, 'LEGACY(B-M7) tag without a LEGACY_SITES entry'],
    ['js/core/EventBus.js', 7, 'Events.NEVER_EMITTED is never emitted'],
    ['js/core/EventBus.js', 7, 'Events.NEVER_SUBSCRIBED has no subscriber'],
    ['js/app/WallController.js', 7, 'Events.TYPO is not a key'],
    ['js/legacy/LegacyCompat.js', 8, 'Strategies.unused is never referenced'],
    ['js/legacy/LegacyCompat.js', 8, 'Strategies.mesh.gltf.attributes is never referenced'],
    ['js/domain/Wall.js', 9, "'THREE' identifier in the pure layer"],
    ['js/geometry/WallLayout.js', 9, "'document' identifier in the pure layer"],
    ['js/io/Exporter.js', 9, "'window' identifier in the pure layer"],
    ['js/app/WallController.js', 10, 'write to section.name'],
    ['js/app/WallController.js', 10, 'write to wall.nextSectionId'],
    ['js/app/WallController.js', 10, 'write to sections[...].panelCols'],
    ['js/app/WallController.js', 10, 'write to display.showGrid'],
    ['js/app/WallController.js', 10, 'write to cine.posX'],
    ['js/ui/PanelA.js', 10, 'write to style.fontSize'],
    ['js/ui/PanelA.js', 10, 'write to style.borderThickness'],
    ['js/app/WallController.js', 10, 'write to normals.onTop'],
    ['js/app/WallController.js', 10, 'write to settings.shading'],
    ['js/interaction/Gizmo.js', 11, 'renderOrder literal 999'],
    ['js/interaction/Gizmo.js', 11, 'renderOrder literal 9.95e2'],
    ['js/interaction/Gizmo.js', 11, 'renderOrder literal 0x3e3'],
]);

async function selfTest() {
    let ok = true;
    const fail = (msg) => { ok = false; console.log(`  FAIL ${msg}`); };

    console.log('self-test: tests/static/fixtures/good (must pass)');
    const good = await runChecks(path.join(FIXTURES, 'good'));
    if (good.nothingToCheck) fail('good fixture has no js/ directory');
    for (const v of good.violations) fail(`unexpected violation: ${formatViolation(v)}`);
    for (const nt of good.notices) fail(`unexpected notice: ${nt}`);
    if (!good.violations.length && !good.notices.length) console.log(`  ok: ${good.files} files, no violations`);

    console.log('self-test: tests/static/fixtures/bad (every rule must fire)');
    const bad = await runChecks(path.join(FIXTURES, 'bad'));
    const fired = new Set(bad.violations.map((v) => v.rule));
    for (const rule of Object.keys(RULE_TITLES).map(Number)) {
        if (!fired.has(rule)) fail(`rule ${rule} (${RULE_TITLES[rule]}) did not fire on the bad fixture`);
    }
    for (const [file, rule, fragment] of EXPECTED_BAD) {
        if (!bad.violations.some((v) => v.file === file && v.rule === rule && v.message.includes(fragment))) {
            fail(`expected on the bad fixture: ${file} [rule ${rule}] ...${fragment}...`);
        }
    }
    console.log(`  ${bad.violations.length} violations, rules fired: ${[...fired].sort((a, b) => a - b).join(', ')}`);

    console.log('self-test: a tree without js/ (must report nothing to check)');
    const none = await runChecks(FIXTURES);
    if (!none.nothingToCheck) fail('tests/static/fixtures (no js/ at its root) should be "nothing to check"');
    else console.log('  ok: nothing to check');

    console.log(ok ? 'SELF-TEST PASSED' : 'SELF-TEST FAILED');
    return ok ? 0 : 1;
}

// ---- CLI --------------------------------------------------------------------------------------

async function main(argv) {
    let root = REPO_ROOT;
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--self-test') return selfTest();
        if (a === '--root') {
            const dir = argv[++i];
            if (!dir) {
                console.error('--root needs a directory');
                return 2;
            }
            root = path.resolve(dir);
        } else if (a === '--help' || a === '-h') {
            console.log('Usage: node tests/static/check.mjs [--root <dir>] | --self-test');
            return 0;
        } else {
            console.error(`Unknown argument: ${a}`);
            return 2;
        }
    }
    const result = await runChecks(root);
    if (result.nothingToCheck) {
        console.log(`nothing to check (no js/ directory under ${root})`);
        return 0;
    }
    for (const nt of result.notices) console.log(`note: ${nt}`);
    for (const v of result.violations) console.log(formatViolation(v));
    const byRule = {};
    for (const v of result.violations) byRule[v.rule] = (byRule[v.rule] || 0) + 1;
    const summary = Object.entries(byRule).map(([r, k]) => `rule ${r} (${RULE_TITLES[r]}): ${k}`).join('; ');
    console.log(result.violations.length
        ? `${result.violations.length} violation(s) in ${result.files} files: ${summary}`
        : `OK: ${result.files} files, no violations`);
    return result.violations.length ? 1 : 0;
}

const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && samePath(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
    main(process.argv).then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
}
