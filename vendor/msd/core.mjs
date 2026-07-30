// ESM shim for the vendored CommonJS validation core.
//
// `core.js` is upstream code (AGPL-3.0), vendored verbatim and CommonJS. This
// repository is ESM. The shim re-exports its two entry points through
// `createRequire` so the CLI layer can `import` them.
//
// This file is Node-only by construction (it uses `node:module`), which is
// exactly why it lives under `vendor/` and never under `src/core/**` — the pure
// core must stay browser-portable. A browser build bundles `core.js` directly;
// bundlers handle CommonJS natively and this shim is not needed there
// (see docs/dependency.md).
//
// This shim is this repository's own code, not a vendored artefact, and is
// therefore outside the drift check's scope.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateMsd, formatErrors } = require('./core.js');

export { validateMsd, formatErrors };
