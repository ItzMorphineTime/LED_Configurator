/**
 * @module geometry/WallMeshBuilder
 * Fixture (good): mesh profile leaves are read as this.profile.<leaf>; a regex literal containing
 * quotes, a backtick and slashes, and a regex right after an `if (...)` header, must not confuse the
 * lexer; a LEGACY tag may wrap across JSDoc lines.
 */
export class WallMeshBuilder {
    constructor(profile) {
        this.profile = profile;
    }

    /**
     * LEGACY(B-H1,
     *   B-H2): legacy clockwise winding for viewport strips and exported faces.
     */
    quadIndices(v) {
        const re = /["'`]\/\/[^/]*$/g;   // not a string, not a comment
        if (v < 0) /window|document|THREE/.test(String(v));   // a regex, not a division: no identifiers inside
        return this.profile.winding === 'legacy-cw' && !re.test('') ? [v, v + 3, v + 2] : [v];
    }
}
