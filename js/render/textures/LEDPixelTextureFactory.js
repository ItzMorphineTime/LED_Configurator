/**
 * @module render/textures/LEDPixelTextureFactory
 * The LED-simulation tile textures: one 64x64 canvas per (colour, layout) painted with one of five sub-pixel
 * layouts, cached as a master texture and handed out as clones that the materials tile with `repeat`.
 * Also installs the canvas `roundRect` polyfill that the painters rely on (legacy ran it at script top level).
 * Legacy source: index.html@cd3fd3f 1411-1424 (polyfill), 1804-1989 (cache, tile, painters, tiled, clear).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry). The theme and document are injected.
 */

import THREE from '../../vendor/three.js';

/**
 * Installs the `roundRect` polyfill if the 2D context lacks it (a no-op in browsers that have it).
 * The only global mutation of the application (ARCHITECTURE.md 1.5). Called once by main.js before anything else.
 * Ports: index.html@cd3fd3f lines 1411-1424.
 * Side effects: may define proto.roundRect.
 * @param {object} [proto]  defaults to CanvasRenderingContext2D.prototype (looked up at call time)
 * @returns {void}
 */
export function installCanvasPolyfills(proto = CanvasRenderingContext2D.prototype) {
  // Polyfill for roundRect if not available
  if (!proto.roundRect) {
    proto.roundRect = function(x, y, w, h, r) {
      if (w < 2 * r) r = w / 2;
      if (h < 2 * r) r = h / 2;
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }
}

// ---- painters (module-private, verbatim 1858-1978) -------------------------------------------------

/**
 * 'single-dot' (also the default layout): radial glow plus a bright centre.
 * Ports: index.html@cd3fd3f lines 1858-1876.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} size
 * @param {THREE.Color} ledColor
 */
function drawSingleDot(ctx, cx, cy, size, ledColor) {
  const ledRadius = size * 0.35;

  // Glow effect
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, ledRadius * 1.5);
  gradient.addColorStop(0, `rgba(${ledColor.r * 255}, ${ledColor.g * 255}, ${ledColor.b * 255}, 1)`);
  gradient.addColorStop(0.5, `rgba(${ledColor.r * 255}, ${ledColor.g * 255}, ${ledColor.b * 255}, 0.4)`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, ledRadius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Bright center
  ctx.fillStyle = `rgb(${ledColor.r * 255}, ${ledColor.g * 255}, ${ledColor.b * 255})`;
  ctx.beginPath();
  ctx.arc(cx, cy, ledRadius * 0.6, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 'rgb-triangle': three sub-pixel dots (red top, green bottom-left, blue bottom-right).
 * Ports: index.html@cd3fd3f lines 1878-1913.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {THREE.Color} ledColor
 */
function drawRGBTriangle(ctx, size, ledColor) {
  const dotRadius = size * 0.18;
  const brightness = (ledColor.r + ledColor.g + ledColor.b) / 3; // unused, kept verbatim

  // RGB sub-pixels in triangle arrangement
  const positions = [
    { x: size * 0.5, y: size * 0.28, color: [1, 0, 0] },  // Red top
    { x: size * 0.28, y: size * 0.68, color: [0, 1, 0] }, // Green bottom-left
    { x: size * 0.72, y: size * 0.68, color: [0, 0, 1] }  // Blue bottom-right
  ];

  positions.forEach(pos => {
    const r = pos.color[0] * ledColor.r * 255;
    const g = pos.color[1] * ledColor.g * 255;
    const b = pos.color[2] * ledColor.b * 255;
    const intensity = (r + g + b) / 3 / 255;

    if (intensity > 0.05) {
      // Glow
      const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, dotRadius * 1.8);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
      gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.3)`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, dotRadius * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, dotRadius * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * 'rgb-stripe' (vertical = true) and 'rgb-horizontal' (vertical = false): three rounded sub-pixel stripes.
 * Ports: index.html@cd3fd3f lines 1915-1959.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {THREE.Color} ledColor
 * @param {boolean} vertical
 */
function drawRGBStripe(ctx, size, ledColor, vertical) {
  const stripeWidth = size / 3;
  const colors = [
    { r: ledColor.r, g: 0, b: 0 },
    { r: 0, g: ledColor.g, b: 0 },
    { r: 0, g: 0, b: ledColor.b }
  ];

  colors.forEach((col, i) => {
    const intensity = col.r + col.g + col.b;
    if (intensity > 0.05) {
      let x, y, w, h;
      if (vertical) {
        x = i * stripeWidth;
        y = size * 0.1;
        w = stripeWidth;
        h = size * 0.8;
      } else {
        x = size * 0.1;
        y = i * stripeWidth;
        w = size * 0.8;
        h = stripeWidth;
      }

      // Glow
      const cx = x + w / 2;
      const cy = y + h / 2;
      const gradient = vertical ?
        ctx.createLinearGradient(x, cy, x + w, cy) :
        ctx.createLinearGradient(cx, y, cx, y + h);

      const r = col.r * 255, g = col.g * 255, b = col.b * 255;
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.1)`);
      gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.8)`);
      gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 1)`);
      gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.8)`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.1)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 3);
      ctx.fill();
    }
  });
}

/**
 * 'square': a full-tile glow plus a rounded square pixel.
 * Ports: index.html@cd3fd3f lines 1961-1978.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {THREE.Color} ledColor
 */
function drawSquarePixel(ctx, size, ledColor) {
  const padding = size * 0.12;
  const pixelSize = size - padding * 2;

  // Glow
  const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size * 0.6);
  gradient.addColorStop(0, `rgba(${ledColor.r * 255}, ${ledColor.g * 255}, ${ledColor.b * 255}, 0.8)`);
  gradient.addColorStop(0.6, `rgba(${ledColor.r * 255}, ${ledColor.g * 255}, ${ledColor.b * 255}, 0.2)`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Square pixel
  ctx.fillStyle = `rgb(${ledColor.r * 255}, ${ledColor.g * 255}, ${ledColor.b * 255})`;
  ctx.beginPath();
  ctx.roundRect(padding, padding, pixelSize, pixelSize, 4);
  ctx.fill();
}

/**
 * Paints one tile with the painter of `layout` ('single-dot' for any unknown value).
 * Ports: index.html@cd3fd3f lines 1824-1845.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {*} layout  display.ledLayout
 * @param {THREE.Color} ledColor
 */
function paintTile(ctx, size, layout, ledColor) {
  const cx = size / 2;
  const cy = size / 2;

  switch (layout) {
    case 'single-dot':
      drawSingleDot(ctx, cx, cy, size, ledColor);
      break;
    case 'rgb-triangle':
      drawRGBTriangle(ctx, size, ledColor);
      break;
    case 'rgb-stripe':
      drawRGBStripe(ctx, size, ledColor, true);
      break;
    case 'rgb-horizontal':
      drawRGBStripe(ctx, size, ledColor, false);
      break;
    case 'square':
      drawSquarePixel(ctx, size, ledColor);
      break;
    default:
      drawSingleDot(ctx, cx, cy, size, ledColor);
  }
}

/**
 * Creates and caches the LED tile textures (legacy `ledPixelTextureCache` and its functions).
 */
export class LEDPixelTextureFactory {
  /** @type {Document} */
  #doc;
  /** @type {import('../../domain/Project.js').DisplaySettings} */
  #display;
  /** @type {{canvas: object}} */
  #theme;
  /** @type {Record<string, THREE.CanvasTexture>} master tiles keyed `${hex}-${layout}` (legacy plain object; the colour
   *  normalised to THREE.Color#getHexString since 08 P2-7e) */
  #cache = {};

  /**
   * Stores the dependencies only (R4).
   * Side effects: none.
   * @param {{doc: Document, display: import('../../domain/Project.js').DisplaySettings, theme: {canvas: object}}} deps
   *   doc: creates the tile canvases; display: ledLayout is read at call time; theme: { canvas: CanvasTheme }
   */
  constructor({ doc, display, theme }) {
    this.#doc = doc;
    this.#display = display;
    this.#theme = theme;
  }

  /**
   * One LED tile texture for `color` in the current layout: a clone of the cached master (created on a miss). The cache
   * key is `${new THREE.Color(color).getHexString()}-${layout}` (08 P2-7e, B-L18: legacy stringified the argument, so
   * every THREE.Color gave "[object Object]" and shared one tile; latent while the only Color caller passed white).
   * Ports: index.html@cd3fd3f lines 1807-1856.
   * Side effects: on a miss, a 64x64 canvas and a master CanvasTexture are created and cached; every call
   * allocates the returned clone (a new THREE texture id).
   * @param {*} color  a CSS colour string (section colour) or a THREE.Color (combined mode)
   * @returns {THREE.CanvasTexture} a fresh clone of the master tile
   */
  tile(color) {
    // LEGACY(B-L20): the cache is never bounded or evicted (one master per colour and layout seen).
    const ledColor = new THREE.Color(color);
    const cacheKey = `${ledColor.getHexString()}-${this.#display.ledLayout}`;
    if (this.#cache[cacheKey]) {
      return this.#cache[cacheKey].clone();
    }

    const canvas = this.#doc.createElement('canvas');
    const size = 64; // Small texture that will be repeated
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Dark background
    ctx.fillStyle = this.#theme.canvas.background;
    ctx.fillRect(0, 0, size, size);

    paintTile(ctx, size, this.#display.ledLayout, ledColor);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;

    this.#cache[cacheKey] = texture;
    return texture.clone();
  }

  /**
   * A tile clone repeated ledX x ledY times (one tile per LED).
   * Ports: index.html@cd3fd3f lines 1980-1984.
   * Side effects: as tile(); sets the clone's repeat.
   * @param {*} ledX
   * @param {*} ledY
   * @param {*} color
   * @returns {THREE.CanvasTexture}
   */
  tiled(ledX, ledY, color) {
    const texture = this.tile(color);
    texture.repeat.set(ledX, ledY);
    return texture;
  }

  /**
   * Disposes the cached masters (never the clones handed out) and empties the cache.
   * Ports: index.html@cd3fd3f lines 1986-1989.
   * Side effects: THREE `dispose` events of the master textures.
   * @returns {void}
   */
  clearCache() {
    Object.values(this.#cache).forEach(tex => tex.dispose());
    this.#cache = {};
    this.#canvasCache.clear();
  }

  /** @type {Map<string, HTMLCanvasElement>} the UV viewer's plain tile canvases, keyed like #cache (04 6.11) */
  #canvasCache = new Map();

  /**
   * The LED tile of `color` in the current layout as a plain 64 x 64 canvas, for the UV viewer's LED background
   * (04 5.3, 6.11): drawn exactly like tile()'s master, cached per colour and layout, with no THREE texture (so the
   * viewer allocates no WebGL resource). clearCache() empties it with the masters.
   * Side effects: on a miss, creates and draws one canvas.
   * @param {*} color  a CSS colour string
   * @returns {HTMLCanvasElement}
   */
  tileCanvas(color) {
    const ledColor = new THREE.Color(color);
    const key = `${ledColor.getHexString()}-${this.#display.ledLayout}`;
    let canvas = this.#canvasCache.get(key);
    if (!canvas) {
      canvas = this.#doc.createElement('canvas');
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = this.#theme.canvas.background;
      ctx.fillRect(0, 0, size, size);
      paintTile(ctx, size, this.#display.ledLayout, ledColor);
      this.#canvasCache.set(key, canvas);
    }
    return canvas;
  }
}
