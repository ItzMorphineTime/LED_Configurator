/**
 * @module ui/PropsPanel
 * The "Scene Props" section of the control panel: one PropControls instance per prop prefix ('person', 'car')
 * with the show toggle and the position / rotation / scale inputs (commands down), and the mirrors of the
 * options block and the gizmo write-backs (events up).
 * Owns #toggle-<prefix>, #<prefix>-options, #<prefix>-pos-x, #<prefix>-pos-z, #<prefix>-rot-y, #<prefix>-scale.
 * Legacy source: index.html@cd3fd3f 3351-3352 / 3358-3359 (gizmo translate write-back), 3391 / 3397 (gizmo rotate
 * write-back), 4332-4361 (person handlers), 4363-4392 (car handlers).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */

import { Events } from '../core/EventBus.js';
import { Prop } from '../domain/Prop.js';
import { byId, flipToggle, setDisplay } from './dom.js';

/**
 * The controls of one prop (new PropControls({doc, prefix: 'person', ...}) and ({..., prefix: 'car', ...})).
 */
export class PropControls {
  /** @type {'person'|'car'} */
  #prefix;
  /** @type {import('../app/PropController.js').PropController} */
  #controller;
  /** @type {import('../domain/Prop.js').Prop} */
  #prop;
  /** @type {HTMLElement} */ #toggle;
  /** @type {HTMLElement} */ #options;
  /** @type {HTMLInputElement} */ #posX;
  /** @type {HTMLInputElement} */ #posZ;
  /** @type {HTMLInputElement} */ #rotY;
  /** @type {HTMLInputElement} */ #scale;

  /**
   * Stores the collaborators, looks up the owned elements and subscribes the two mirrors, which ignore payloads
   * whose id is not this prefix:
   *  PROP_VISIBILITY_CHANGED({id, visible}): #<prefix>-options display (4335 / 4366)
   *  PROP_POSE_CHANGED({id, source}): 'gizmo-translate' -> pos-x, pos-z toFixed(2) (3351-3352 / 3358-3359);
   *    'gizmo-rotate' -> rot-y toFixed(1) (3391 / 3397); 'pivot' (03 T4) -> pos-x, pos-z toFixed(2)
   * Side effects: DOM lookups (no mutation); two bus subscriptions.
   * @param {{doc: Document, prefix: 'person'|'car',
   *          controller: import('../app/PropController.js').PropController,
   *          prop: import('../domain/Prop.js').Prop, bus: import('../core/EventBus.js').EventBus}} deps
   */
  constructor({ doc, prefix, controller, prop, bus }) {
    this.#prefix = prefix;
    this.#controller = controller;
    this.#prop = prop;

    this.#toggle = byId(doc, `toggle-${prefix}`);
    this.#options = byId(doc, `${prefix}-options`);
    this.#posX = byId(doc, `${prefix}-pos-x`);
    this.#posZ = byId(doc, `${prefix}-pos-z`);
    this.#rotY = byId(doc, `${prefix}-rot-y`);
    this.#scale = byId(doc, `${prefix}-scale`);

    bus.on(Events.PROP_VISIBILITY_CHANGED, (payload) => this.#mirrorVisibility(payload));
    bus.on(Events.PROP_POSE_CHANGED, (payload) => this.#mirrorPose(payload));
  }

  /**
   * Adds the prop listeners in legacy order: show toggle, then pos-x, pos-z, rot-y, scale. Each input stores its
   * parsed value, writes it back iff Prop.FIELD_RULES[field].writeBack (rotation and scale only) and then applies
   * the transform.
   * Ports: index.html@cd3fd3f lines 4332-4361 (person) / 4363-4392 (car).
   * Side effects: adds 5 listeners (click / change).
   * @returns {void}
   */
  bind() {
    const controller = this.#controller;

    const toggle = this.#toggle;
    toggle.addEventListener('click', () => {
      controller.setVisible(flipToggle(toggle));
    });

    for (const [input, field] of this.#fieldInputs()) {
      input.addEventListener('change', () => {
        const value = controller.setField(field, input.value);
        if (Prop.FIELD_RULES[field].writeBack) input.value = value;
        controller.applyTransform();
      });
    }
  }

  /**
   * The prop inputs with their Prop field, in legacy listener order.
   * @returns {[HTMLInputElement, string][]}
   */
  #fieldInputs() {
    return [
      [this.#posX, 'posX'],
      [this.#posZ, 'posZ'],
      [this.#rotY, 'rotY'],
      [this.#scale, 'scale'],
    ];
  }

  /**
   * PROP_VISIBILITY_CHANGED mirror: the options block under this prop's toggle.
   * Ports: index.html@cd3fd3f line 4335 / 4366.
   * @param {{id: string, visible: boolean}} payload
   */
  #mirrorVisibility({ id, visible }) {
    if (id !== this.#prefix) return;
    setDisplay(this.#options, visible);
  }

  /**
   * PROP_POSE_CHANGED mirror: the gizmo write-backs of this prop, and (03 T4, 5.5) the re-expression after a pivot edit
   * moved the stage origin ('pivot': pos-x, pos-z toFixed(2), as the translate write-back).
   * Ports: index.html@cd3fd3f lines 3351-3352 / 3358-3359 (translate), 3391 / 3397 (rotate).
   * @param {{id: string, source: 'gizmo-translate'|'gizmo-rotate'|'pivot'}} payload
   */
  #mirrorPose({ id, source }) {
    if (id !== this.#prefix) return;
    const prop = this.#prop;
    if (source === 'gizmo-translate' || source === 'pivot') {
      this.#posX.value = prop.posX.toFixed(2);
      this.#posZ.value = prop.posZ.toFixed(2);
    } else if (source === 'gizmo-rotate') {
      this.#rotY.value = prop.rotY.toFixed(1);
    }
  }
}
