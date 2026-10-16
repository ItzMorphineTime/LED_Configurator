/**
 * @module core/EventBus
 * Fixture (bad), rule 7: NEVER_EMITTED is only subscribed, NEVER_SUBSCRIBED is only emitted.
 */
export const Events = Object.freeze({
    USED: 'a:used',
    NEVER_EMITTED: 'a:neverEmitted',
    NEVER_SUBSCRIBED: 'a:neverSubscribed',
    WALL_REBUILT: 'wall:rebuilt',
});

export class EventBus {
    on(type, handler) { return [type, handler]; }

    emit(type, payload) { return [type, payload]; }
}
