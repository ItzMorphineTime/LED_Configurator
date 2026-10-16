/**
 * @module core/EventBus
 * Fixture (good): three events; WALL_REBUILT is emitted but has no subscriber (the declared seam).
 */
export const Events = Object.freeze({
    WALL_STATS_CHANGED: 'wall:statsChanged',
    WALL_REBUILT: 'wall:rebuilt',
    SELECTION_CHANGED: 'selection:changed',
});

const KNOWN = new Set(Object.values(Events));

export class EventBus {
    #handlers = new Map();

    /** @returns {() => void} unsubscribe */
    on(type, handler) {
        if (!KNOWN.has(type)) throw new Error(`Unknown event: ${type}`);
        if (!this.#handlers.has(type)) this.#handlers.set(type, []);
        this.#handlers.get(type).push(handler);
        return () => this.off(type, handler);
    }

    off(type, handler) {
        const list = this.#handlers.get(type) || [];
        const k = list.indexOf(handler);
        if (k >= 0) list.splice(k, 1);
    }

    emit(type, payload) {
        for (const h of [...(this.#handlers.get(type) || [])]) h(payload);
    }
}
