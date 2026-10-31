/**
 * @module core/AppInfo
 * The application's release identity (spec 07 5.1, D1): APP_VERSION, bumped by hand with each release. It is the
 * version half of the JSON generator record `{ name: Brand.jsonGenerator.name, version: APP_VERSION }` (07 C10, C62) and
 * the `app_version` of an autosave payload (07 4.8); it never decides how a file is read (the file's own "2.<n>"
 * version does, io/ProjectSchema KNOWN_REVISION).
 * Legacy source: none (new in 07 D1).
 * Layer: core (imports nothing).
 */

/** The release version of the app (semver; 07 D1). */
export const APP_VERSION = '2.0.0';
