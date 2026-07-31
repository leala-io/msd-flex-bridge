// ESM shim for the vendored CommonJS exporter closure.
//
// The two files under this directory are upstream code (AGPL-3.0), vendored
// verbatim from the `msd` default branch and CommonJS. This repository is ESM.
// The shim loads them through `createRequire` so the bridge can `import` them.
//
// It exports the `convert` module object itself, not only its functions. That
// object is the exporter's own `module.exports`, and the adapter resolves
// `core.countryToTimezone(...)` on it by property lookup at call time — which is
// what makes the bridge's country-table extension injectable without touching a
// vendored byte. See src/export.js and docs/mapping.md.
//
// This file is Node-only by construction (it uses `node:module`), which is
// exactly why it lives under `vendor/` and never under `src/core/**` — the pure
// core must stay browser-portable. A browser build bundles the two CommonJS
// files directly; bundlers handle CommonJS natively and this shim is not needed
// there (see docs/dependency.md).
//
// This shim is this repository's own code, not a vendored artefact, and is
// therefore outside the drift check's scope.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** The exporter's pure conversion helpers — the module object, deliberately. */
export const convert = require('./core/convert.js');

/** MSD document → GTFS-Flex feed files. Aborts on an unmapped country. */
export const { buildFlexFeed } = require('./adapters/gtfs-flex/index.js');
