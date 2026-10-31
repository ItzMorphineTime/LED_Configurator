// Unit tests of the logo pipeline (docs/improvements/08-bugfix-roadmap.md 6.16; 08 P2-13a, B-L35; 07 6.13):
// core/sha256.js (both paths against Node's crypto), domain/LogoRules.js (the strict data-URI parser and the base64
// codec), LogoLibrary's stored-image fields and distinct count, and render/textures/LogoLoader.js over a fake window
// (FileReader, Image, a canvas whose PNG size is the pixel count times 3, a minimal XML parser and serializer).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { sha256Hex, sha256HexSync } from '../../js/core/sha256.js';
import { MAX_LOGO_BYTES, MAX_LOGO_ASSETS, MAX_LOGO_DATAURI_CHARS } from '../../js/domain/rules.js';
import { LOGO_MIMES, base64ToBytes, bytesToBase64, logoAssetId, logoAssetName, parseLogoDataUri } from '../../js/domain/LogoRules.js';
import { LogoLibrary } from '../../js/domain/LogoLibrary.js';
import { LogoLoader, LogoMessages, sanitizeSvgCss, sanitizeSvgElement, sizeSvgElement } from '../../js/render/textures/LogoLoader.js';

const nodeSha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

describe('core/sha256 (07 6.13)', () => {
  test('both paths equal Node crypto: empty, "abc", 1 MB random and the padding edges 55, 56, 63, 64, 65', async () => {
    const inputs = [new Uint8Array(0), new TextEncoder().encode('abc'), new Uint8Array(crypto.randomBytes(1 << 20))];
    for (const n of [55, 56, 63, 64, 65, 119, 120]) inputs.push(new Uint8Array(crypto.randomBytes(n)));
    for (const bytes of inputs) {
      const want = nodeSha(bytes);
      assert.equal(sha256HexSync(bytes), want, `pure JS, ${bytes.length} bytes`);
      assert.equal(await sha256Hex(bytes), want, `no subtle: the pure-JS path, ${bytes.length} bytes`);
      assert.equal(await sha256Hex(bytes, { subtle: globalThis.crypto.subtle }), want, `subtle, ${bytes.length} bytes`);
    }
    assert.equal(sha256HexSync(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(sha256HexSync(new Uint8Array(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('domain/LogoRules (08 6.16)', () => {
  test('base64 codec round-trips every length and refuses non-canonical text', () => {
    for (let n = 0; n < 70; n++) {
      const bytes = new Uint8Array(crypto.randomBytes(n));
      assert.equal(bytesToBase64(bytes), b64(bytes), `encode ${n}`);
      assert.deepEqual(base64ToBytes(b64(bytes)), bytes, `decode ${n}`);
    }
    const big = new Uint8Array(crypto.randomBytes(100003));
    assert.equal(bytesToBase64(big), b64(big));
    for (const bad of ['abc', 'ab=c', 'a===', 'ab-_', 'ab c', 5, null]) assert.equal(base64ToBytes(bad), null, String(bad));
  });

  test('parseLogoDataUri: only data:<allowlisted image>;base64 with valid base64 within both caps', () => {
    const png = `data:image/png;base64,${b64(Buffer.from('hello png'))}`;
    assert.deepEqual(parseLogoDataUri(png), { mime: 'image/png', base64: b64(Buffer.from('hello png')), bytes: 9 });
    for (const mime of LOGO_MIMES) assert.ok(parseLogoDataUri(`data:${mime};base64,AAAA`), mime);
    const refused = ['https://logo.invalid/remote.png', 'blob:https://x/1', 'javascript:alert(1)', 'data:text/html;base64,PGI+eDwvYj4=',
      'data:image/png;base64,iVBORw0KGgo', 'data:image/gif;base64,AAAA', 'data:image/png,AAAA', 'data:image/PNG;base64,AAAA',
      ' data:image/png;base64,AAAA', 'data:image/png;base64,AA AA', 'data:image/png;base64,AAAA\n', 42, null, undefined];
    for (const s of refused) assert.equal(parseLogoDataUri(s), null, JSON.stringify(s));
    // the decoded cap (2 MiB) and the character cap
    assert.ok(`data:image/svg+xml;base64,${b64(Buffer.alloc(MAX_LOGO_BYTES))}`.length <= MAX_LOGO_DATAURI_CHARS, 'every capped logo fits the character cap');
    const over = `data:image/png;base64,${b64(Buffer.alloc(MAX_LOGO_BYTES + 1))}`;
    assert.equal(parseLogoDataUri(over), null, 'one byte over the cap');
    assert.equal(parseLogoDataUri(`data:image/png;base64,${b64(Buffer.alloc(MAX_LOGO_BYTES))}`).bytes, MAX_LOGO_BYTES, 'exactly at the cap');
  });

  test('logoAssetName strips controls and caps at 128 code units; logoAssetId is a_ + 16 hex', () => {
    assert.equal(logoAssetName('lo\u0000go‮.png'), 'logo.png');
    assert.equal(logoAssetName('x'.repeat(200)).length, 128);
    assert.equal(logoAssetName(7), '');
    assert.equal(logoAssetId('3f9c0e1b2a7d4c55' + '0'.repeat(48)), 'a_3f9c0e1b2a7d4c55');
  });
});

describe('LogoLibrary stored-image fields (08 4.5)', () => {
  test('setImage keeps the meta fields; distinctImageCount counts distinct data URIs, except one section', () => {
    const lib = new LogoLibrary();
    lib.setImage(0, { id: 'img0' }, { dataUri: 'data:image/png;base64,AAAA', mime: 'image/png', bytes: 3, name: 'a.png', sha256: 'f'.repeat(64), assetId: 'a_ffffffffffffffff' });
    assert.deepEqual({ ...lib.get(0), image: null }, { position: 'center', scale: 0.3, image: null, dataUri: 'data:image/png;base64,AAAA', mime: 'image/png', bytes: 3, name: 'a.png', sha256: 'f'.repeat(64), assetId: 'a_ffffffffffffffff' });
    lib.setImage(1, { id: 'img1' }, { dataUri: 'data:image/png;base64,AAAA' });
    lib.setImage(2, { id: 'img2' }, { dataUri: 'data:image/png;base64,BBBB' });
    lib.ensure(3);   // an entry without an image does not count
    assert.equal(lib.distinctImageCount(), 2);
    assert.equal(lib.distinctImageCount(2), 1, 'section 2 replaced: only the shared image remains');
    assert.equal(lib.distinctImageCount(0), 2, 'section 1 still uses the first image');
    assert.deepEqual([...lib.distinctDataUris()], ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB']);
  });
});

// ---- the fake window -----------------------------------------------------------------------------------------

/** A raster the fake Image decodes: `IMG <w>x<h>` followed by filler bytes. */
const raster = (w, h, size = 64) => {
  const head = Buffer.from(`IMG ${w}x${h} `);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length), 7)]);
};

/** A minimal XML element tree (enough DOM for sanitizeSvgElement, sizeSvgElement and the fake serializer). */
class El {
  constructor(name, attrs = []) { this.localName = name.includes(':') ? name.split(':')[1] : name; this.tag = name; this.attrs = attrs; this.children = []; this.text = ''; this.parent = null; }
  get attributes() { return this.attrs.map(([name, value]) => ({ name, value })); }
  getAttribute(n) { const a = this.attrs.find(([k]) => k === n); return a ? a[1] : null; }
  setAttribute(n, v) { const a = this.attrs.find(([k]) => k === n); if (a) a[1] = String(v); else this.attrs.push([n, String(v)]); }
  removeAttribute(n) { this.attrs = this.attrs.filter(([k]) => k !== n); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.text = v; this.children = []; }
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const serialize = (el) => `<${el.tag}${el.attrs.map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}>${esc(el.text)}${el.children.map(serialize).join('')}</${el.tag}>`;

/** Parses well-formed simple XML (no comments, CDATA or entities); anything else yields a parsererror document. */
function parseXml(text) {
  const root = new El('#root');
  const stack = [root];
  const re = /<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/gy;
  let m, pos = 0;
  while (pos < text.length && (m = re.exec(text))) {
    pos = re.lastIndex;
    if (m[1]) { if (stack.pop().tag !== m[1]) return null; }
    else if (m[2]) {
      const attrs = [...m[3].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map((a) => [a[1], a[2]]);
      const el = new El(m[2], attrs);
      el.parent = stack[stack.length - 1];
      el.parent.children.push(el);
      if (!m[4]) stack.push(el);
    } else if (m[5] && stack.length > 1) stack[stack.length - 1].text += m[5];
  }
  return pos === text.length && stack.length === 1 && root.children.length === 1 ? root.children[0] : null;
}

function fakeWin({ pngSize = (w, h) => w * h * 3, readError = false, subtle = undefined } = {}) {
  const canvases = [];
  class FileReader {
    readAsDataURL(file) { this.#done(() => `data:${file.type || 'application/octet-stream'};base64,${b64(file.bytes)}`); }
    readAsText(file) { this.#done(() => Buffer.from(file.bytes).toString('utf8')); }
    #done(result) {
      queueMicrotask(() => {
        if (readError) { this.error = { name: 'NotReadableError' }; this.onerror(); return; }
        this.onload({ target: { result: result() } });
      });
    }
  }
  class Image {
    naturalWidth = 0;
    naturalHeight = 0;
    set src(url) {
      this.url = url;
      queueMicrotask(() => {
        const m = /^data:([^;,]+);base64,(.*)$/.exec(url);
        const text = m ? Buffer.from(m[2], 'base64').toString('utf8') : '';
        let size = null;
        if (m && m[1] === 'image/svg+xml') {
          const w = /<svg[^>]*\swidth="(\d+)"/.exec(text);
          const h = /<svg[^>]*\sheight="(\d+)"/.exec(text);
          size = w && h ? [Number(w[1]), Number(h[1])] : [0, 0];
        } else {
          const r = /^IMG (\d+)x(\d+) /.exec(text);
          if (r) size = [Number(r[1]), Number(r[2])];
        }
        if (!size) { this.onerror(); return; }
        [this.naturalWidth, this.naturalHeight] = size;
        this.complete = true;
        this.onload();
      });
    }
  }
  const document = {
    createElement: () => {
      const canvas = {
        width: 0, height: 0,
        getContext: () => ({ drawImage: (img, x, y, w, h) => canvases.push([img.naturalWidth, img.naturalHeight, w, h]) }),
        toDataURL: (type) => `data:${type};base64,${b64(raster(canvas.width, canvas.height, pngSize(canvas.width, canvas.height)))}`,
      };
      return canvas;
    },
  };
  class DOMParser {
    parseFromString(text) {
      const root = parseXml(text);
      if (!root) return { documentElement: new El('parsererror'), getElementsByTagName: () => [1] };
      return { documentElement: root, getElementsByTagName: () => [] };
    }
  }
  class XMLSerializer { serializeToString(el) { return serialize(el); } }
  return { FileReader, Image, DOMParser, XMLSerializer, document, crypto: subtle === undefined ? undefined : { subtle }, canvases };
}

const file = (name, type, bytes) => ({ name, type, size: bytes.length, bytes });
const loader = (win, logos = new LogoLibrary()) => new LogoLoader({ win, logos });

describe('LogoLoader upload (08 6.16, P2-13a)', () => {
  test('a PNG, JPEG or WebP file is stored verbatim with its SHA-256 and asset id', async () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      const bytes = raster(40, 20, 500);
      const r = await loader(fakeWin({ subtle: globalThis.crypto.subtle })).load({ file: file('logo', type, bytes), sectionId: 0 });
      assert.equal(r.ok, true, type);
      assert.deepEqual([r.image.naturalWidth, r.image.naturalHeight], [40, 20]);
      assert.deepEqual(r.meta, { dataUri: `data:${type};base64,${b64(bytes)}`, mime: type, bytes: 500, name: 'logo',
        sha256: nodeSha(bytes), assetId: `a_${nodeSha(bytes).slice(0, 16)}` });
    }
  });

  test('M-LOGO-2: a file over 2 MiB is refused before it is read', async () => {
    const big = { name: 'huge.png', type: 'image/png', size: MAX_LOGO_BYTES + 1, get bytes() { throw new Error('read'); } };
    const r = await loader(fakeWin()).load({ file: big, sectionId: 0 });
    assert.deepEqual(r, { ok: false, reason: 'tooLarge', message: 'The logo "huge.png" is larger than 2 MB. Use a smaller PNG, JPEG, WebP or SVG file.' });
    const atCap = await loader(fakeWin()).load({ file: file('cap.png', 'image/png', raster(2, 2, MAX_LOGO_BYTES)), sectionId: 0 });
    assert.equal(atCap.ok, true, 'exactly 2 MiB is accepted');
  });

  test('a BMP (any other decodable type) becomes a PNG; a PNG over the cap is downscaled by 0.9·sqrt(cap/bytes) up to three times', async () => {
    const win = fakeWin();
    const r = await loader(win).load({ file: file('noise.bmp', 'image/bmp', raster(1000, 1000, 2000000)), sectionId: 1 });
    assert.equal(r.ok, true);
    assert.equal(r.meta.mime, 'image/png');
    assert.ok(r.meta.dataUri.startsWith('data:image/png;base64,'));
    const s = 0.9 * Math.sqrt(MAX_LOGO_BYTES / 3000000);
    const side = Math.round(1000 * s);
    assert.deepEqual(win.canvases, [[1000, 1000, 1000, 1000], [1000, 1000, side, side]], 'natural size, then one downscale');
    assert.equal(r.meta.bytes, side * side * 3);
    assert.ok(r.meta.bytes <= MAX_LOGO_BYTES);
    assert.deepEqual([r.image.naturalWidth, r.image.naturalHeight], [side, side]);
    // a small GIF converts without a downscale
    const gif = await loader(fakeWin()).load({ file: file('a.gif', 'image/gif', raster(10, 5)), sectionId: 1 });
    assert.equal(gif.ok, true);
    assert.equal(gif.meta.bytes, 150);
  });

  test('M-LOGO-2: a converted raster that still exceeds the cap after three downscales', async () => {
    const win = fakeWin({ pngSize: () => MAX_LOGO_BYTES + 10 });
    const r = await loader(win).load({ file: file('x.avif', 'image/avif', raster(500, 500)), sectionId: 0 });
    assert.equal(r.reason, 'tooLarge');
    assert.equal(win.canvases.length, 4, 'the natural size and three downscales');
  });

  test('M-LOGO-1: a read error, an undecodable image, a 0 x 0 image or a type mismatch', async () => {
    const msg = 'Could not load the logo image "bad.png". Use a PNG, JPEG, WebP or SVG file.';
    assert.deepEqual(await loader(fakeWin({ readError: true })).load({ file: file('bad.png', 'image/png', raster(2, 2)), sectionId: 0 }),
      { ok: false, reason: 'unreadable', message: msg });
    assert.equal((await loader(fakeWin()).load({ file: file('bad.png', 'image/png', Buffer.from('not an image')), sectionId: 0 })).message, msg);
    assert.equal((await loader(fakeWin()).load({ file: file('bad.png', 'image/png', raster(0, 0)), sectionId: 0 })).message, msg);
    assert.equal((await loader(fakeWin()).load({ file: file('bad.png', 'image/bmp', Buffer.from('junk')), sectionId: 0 })).reason, 'unreadable');
  });

  test('M-LOGO-3: a 65th distinct image is refused; a reused image and a replaced only use are not new', async () => {
    const logos = new LogoLibrary();
    for (let i = 0; i < MAX_LOGO_ASSETS; i++) logos.setImage(i, {}, { dataUri: `data:image/png;base64,${b64(raster(i + 1, 1))}` });
    const L = loader(fakeWin(), logos);
    const fresh = await L.load({ file: file('new.png', 'image/png', raster(999, 1)), sectionId: 100 });
    assert.deepEqual(fresh, { ok: false, reason: 'tooMany', message: LogoMessages.tooMany() });
    assert.equal(LogoMessages.tooMany(), 'This project already uses 64 different logo images, the maximum. Reuse one of them or remove a logo first.');
    assert.equal((await L.load({ file: file('same.png', 'image/png', raster(5, 1)), sectionId: 100 })).ok, true, 'an image already in use');
    assert.equal((await L.load({ file: file('new.png', 'image/png', raster(999, 1)), sectionId: 7 })).ok, true, 'section 7 replaces its only use');
  });

  test('an SVG is sanitised (script, foreignObject, external href, on*, url()) and sized from its viewBox', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 100" onload="x()">'
      + '<script>alert(1)</script><foreignObject width="1" height="1"><div>x</div></foreignObject>'
      + '<style>@import url(https://e.invalid/a.css); .a { fill: url(#g); background: url(https://e.invalid/p.png) }</style>'
      + '<image href="https://logo.invalid/p.png" xlink:href="javascript:alert(1)" width="1" height="1"/>'
      + '<use href="#g"/><image href="data:image/png;base64,AAAA" width="1" height="1"/>'
      + '<rect width="16" height="8" fill="#ff00aa" onclick="y()" style="fill: url(http://e.invalid/x)"/></svg>';
    const r = await loader(fakeWin()).load({ file: file('hostile.svg', 'image/svg+xml', Buffer.from(svg)), sectionId: 0 });
    assert.equal(r.ok, true);
    assert.equal(r.meta.mime, 'image/svg+xml');
    const text = Buffer.from(r.meta.dataUri.split(',')[1], 'base64').toString('utf8');
    for (const gone of ['<script', 'foreignObject', '.invalid', 'javascript:', 'onload', 'onclick', '@import']) {
      assert.ok(!text.includes(gone), `${gone} removed: ${text}`);
    }
    assert.ok(text.includes('url(#g)') && text.includes('href="#g"') && text.includes('href="data:image/png;base64,AAAA"'), 'safe references kept');
    assert.match(text, /^<svg [^>]*width="1024" height="512"/, 'sized 1024 x round(1024 * 100 / 200)');
    assert.equal(r.meta.bytes, Buffer.byteLength(text));
    assert.deepEqual([r.image.naturalWidth, r.image.naturalHeight], [1024, 512]);
  });

  test('M-LOGO-1 for an SVG that does not parse; an SVG with its own size keeps it', async () => {
    const bad = await loader(fakeWin()).load({ file: file('bad.svg', 'image/svg+xml', Buffer.from('<svg><g></svg>')), sectionId: 0 });
    assert.equal(bad.reason, 'unreadable');
    const sized = await loader(fakeWin()).load({ file: file('s.svg', '', Buffer.from('<svg width="16" height="8"><rect width="1" height="1"/></svg>')), sectionId: 0 });
    assert.equal(sized.ok, true, 'a .svg name with no MIME type is read as SVG');
    assert.match(Buffer.from(sized.meta.dataUri.split(',')[1], 'base64').toString('utf8'), /^<svg width="16" height="8">/);
  });

  test('sizeSvgElement and sanitizeSvgCss (08 6.16)', () => {
    const root = (attrs) => new El('svg', attrs);
    const r1 = root([['viewBox', '0 0 50 200']]);
    assert.equal(sizeSvgElement(r1), true);
    assert.deepEqual([r1.getAttribute('width'), r1.getAttribute('height')], ['1024', '4096']);
    const r2 = root([['width', '100%'], ['height', '20']]);
    assert.equal(sizeSvgElement(r2), true, 'a percentage is not a size');
    assert.deepEqual([r2.getAttribute('width'), r2.getAttribute('height')], ['1024', '1024']);
    assert.equal(sizeSvgElement(root([['width', '10mm'], ['height', '2.5']])), false);
    assert.equal(sanitizeSvgCss("@import 'x.css'; a { b: url( '#k' ); c: url(data:image/png;base64,AA) }"), " a { b: url( '#k' ); c: none }");
    const tree = parseXml('<svg><a href="javascript:x()"><text>t</text></a><iframe/><video/></svg>');
    sanitizeSvgElement(tree);
    assert.equal(serialize(tree), '<svg><a><text>t</text></a></svg>');
  });
});

describe('LogoLoader import (08 6.16, P2-13e)', () => {
  test('a raster asset is kept verbatim; an SVG asset is sanitised again; a broken one is refused', async () => {
    const bytes = raster(8, 8, 100);
    const png = `data:image/png;base64,${b64(bytes)}`;
    const r = await loader(fakeWin()).load({ dataUri: png, name: 'logo.png' });
    assert.deepEqual(r.meta, { dataUri: png, mime: 'image/png', bytes: 100, name: 'logo.png', sha256: nodeSha(bytes), assetId: `a_${nodeSha(bytes).slice(0, 16)}` });
    const svg = `data:image/svg+xml;base64,${b64(Buffer.from('<svg width="4" height="2"><script>x</script></svg>'))}`;
    const s = await loader(fakeWin()).load({ dataUri: svg, name: 'h.svg' });
    assert.equal(Buffer.from(s.meta.dataUri.split(',')[1], 'base64').toString('utf8'), '<svg width="4" height="2"></svg>');
    const again = await loader(fakeWin()).load({ dataUri: s.meta.dataUri, name: 'h.svg' });
    assert.equal(again.meta.dataUri, s.meta.dataUri, 'sanitising a sanitised SVG changes nothing');
    for (const dataUri of ['https://logo.invalid/a.png', `data:image/png;base64,${b64(Buffer.from('junk'))}`]) {
      const bad = await loader(fakeWin()).load({ dataUri, name: 'x.png' });
      assert.deepEqual(bad, { ok: false, reason: 'unreadable', message: LogoMessages.unreadable('x.png') });
    }
  });
});
