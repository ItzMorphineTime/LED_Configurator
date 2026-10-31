/**
 * @module ui/RestoreBanner
 * The restore banner (spec 07 H3, 3.4; the owner's request of 2026-11-01): the first child of the viewport's top-centre
 * stack (#viewport-top-stack, 07 C51), shown at boot when app/Autosave offers the previous session's work:
 * "Restore unsaved work from <relative time> — <project name>?" with Restore (#autosave-restore: Autosave.restore, the
 * project validated like an Open and one undoable history entry) and Discard (#autosave-discard: Autosave.discard,
 * both autosave slots removed). Non-modal (editing goes on while it shows; autosave writes nothing until it is
 * answered), not focus-trapped, keyboard reachable (two native buttons in a role="region" with a label); Escape does
 * not dismiss it. The absolute time of the autosave is the text's title.
 * Owns #autosave-banner, #autosave-banner-text, #autosave-restore, #autosave-discard.
 * Legacy source: none (new in 07 H3).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */
import { ProjectMeta } from '../domain/Project.js';
import { byId } from './dom.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago `then` was: "a moment ago" (under a minute, or in the future), "N minute(s) ago", "N hour(s) ago",
 * "yesterday" (24 to 48 hours), "N days ago".
 * Side effects: none.
 * @param {number} then  epoch ms
 * @param {number} now   epoch ms
 * @returns {string}
 */
export function relativeTime(then, now) {
  const ms = now - then;
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (!Number.isFinite(ms) || ms < MINUTE) return 'a moment ago';
  if (ms < HOUR) return plural(Math.floor(ms / MINUTE), 'minute');
  if (ms < DAY) return plural(Math.floor(ms / HOUR), 'hour');
  if (ms < 2 * DAY) return 'yesterday';
  return plural(Math.floor(ms / DAY), 'day');
}

/**
 * The banner's question.
 * Side effects: none.
 * @param {{savedAt: number, name: string}} offer  Autosave.start()'s offer
 * @param {number} now  epoch ms
 * @returns {string}
 */
export function restoreBannerText(offer, now) {
  const name = String(offer.name ?? '').trim().slice(0, ProjectMeta.NAME_MAX_LENGTH) || ProjectMeta.DEFAULT_NAME;
  return `Restore unsaved work from ${relativeTime(offer.savedAt, now)} — ${name}?`;
}

/** The restore banner of the previous session's autosaved work. */
export class RestoreBanner {
  /** @type {{restore(): Promise<boolean>, discard(): void}} app/Autosave */ #autosave;
  /** @type {() => number} Date.now */ #clock;
  /** @type {HTMLElement} */ #banner;
  /** @type {HTMLElement} */ #text;
  /** @type {HTMLElement} */ #restoreBtn;
  /** @type {HTMLElement} */ #discardBtn;

  /**
   * Stores the collaborators and looks up the owned elements (R4: nothing else).
   * @param {{doc: Document, autosave: {restore(): Promise<boolean>, discard(): void}, clock?: () => number}} deps
   */
  constructor({ doc, autosave, clock = () => Date.now() }) {
    this.#autosave = autosave;
    this.#clock = clock;
    this.#banner = byId(doc, 'autosave-banner');
    this.#text = byId(doc, 'autosave-banner-text');
    this.#restoreBtn = byId(doc, 'autosave-restore');
    this.#discardBtn = byId(doc, 'autosave-discard');
  }

  /** Adds the two buttons' click listeners. Side effects: 2 element listeners. */
  bind() {
    this.#restoreBtn.addEventListener('click', () => this.restore());
    this.#discardBtn.addEventListener('click', () => this.discard());
  }

  /** @returns {boolean} whether the banner shows */
  get visible() {
    return !this.#banner.hidden;
  }

  /**
   * Shows the offer.
   * Side effects: the text, its title and the banner's hidden attribute.
   * @param {{savedAt: number, name: string}} offer
   */
  show(offer) {
    this.#text.textContent = restoreBannerText(offer, this.#clock());
    this.#text.title = Number.isFinite(offer.savedAt) && offer.savedAt > 0 ? `Autosaved ${new Date(offer.savedAt).toLocaleString()}` : '';
    this.#banner.hidden = false;
  }

  /** Side effects: hides the banner. */
  hide() {
    this.#banner.hidden = true;
  }

  /**
   * Restore: hides the banner, then restores the offered project (Autosave.restore).
   * @returns {Promise<boolean>} whether it was restored
   */
  restore() {
    this.hide();
    return this.#autosave.restore();
  }

  /** Discard: hides the banner and removes the autosaved work (Autosave.discard). */
  discard() {
    this.hide();
    this.#autosave.discard();
  }
}
