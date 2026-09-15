# Build note

The source tree is authoritative. `deploy-snapshot/` is the previously validated static deployment snapshot retained for continuity.

Run `npm ci` followed by `npm run check` in an npm-enabled environment to produce a fresh Vite build from the recovered source. The working environment used to assemble this package could run Node validation/tests but timed out while installing the npm dependency tree, so no fresh Vite build is falsely claimed here.

Strava is intentionally unchanged and disabled.
