/**
 * export.js — the export direction, wired (P2/B.2)
 *
 * The exporter itself is vendored (vendor/msd-engine/), not re-implemented: a
 * roundtrip has to compare this repository's lift against upstream's own export,
 * not against a second implementation written to agree with it.
 *
 * What this module adds is the country-table extension, and it adds it by
 * **injection** — route (a) of the two the blueprint left open, chosen because
 * inspection showed it was available:
 *
 *   - `COUNTRY_TZ` in the vendored `core/convert.js` is a module-local const and
 *     is not reachable. But `countryToTimezone` — the only thing that reads it —
 *     is exported, and the vendored adapter calls it as `core.countryToTimezone(…)`,
 *     a property lookup on the required module object, performed at call time.
 *   - So replacing that one property on the module object, before the exporter
 *     runs, is enough. Both vendored files stay byte-identical and the drift
 *     check keeps working unchanged. The fallback route — a documented derived
 *     copy of `convert.js` carried alongside the pristine one — was not needed.
 *
 * This module lives outside `src/core/**` on purpose. Replacing a property on
 * another module's exports is a side effect, and the pure core does not have
 * side effects. The table itself is pure and does live in the core
 * (`src/core/country-timezone.js`).
 *
 * No host imports here either: the vendored modules are handed in, exactly as
 * the validator is handed to `src/core/validate.js`.
 */

import { extendCountryTimezone } from './core/country-timezone.js';

/** Marks a module object whose resolver this repository has already replaced. */
const EXTENDED = Symbol.for('msd-flex-bridge.country-timezone-extended');

/**
 * Wire the vendored exporter with the bridge's extended country table.
 *
 * @param {{convert: object, buildFlexFeed: Function}} injected
 *        `convert` is the vendored `core/convert.js` module object — the object
 *        itself, not a copy of its functions, because the adapter resolves the
 *        resolver on it.
 * @returns {(msd: object) => {files: Record<string,string>, warnings: string[]}}
 *        throws, as upstream does, on a country neither table maps
 */
export function createFlexExporter(injected) {
  const { convert, buildFlexFeed } = injected ?? {};

  if (!convert || typeof convert.countryToTimezone !== 'function') {
    throw new TypeError('createFlexExporter requires the vendored convert module');
  }
  if (typeof buildFlexFeed !== 'function') {
    throw new TypeError('createFlexExporter requires the vendored buildFlexFeed');
  }

  // Idempotent: wiring twice must not stack a second wrapper on the first.
  if (!convert[EXTENDED]) {
    convert.countryToTimezone = extendCountryTimezone(convert.countryToTimezone);
    convert[EXTENDED] = true;
  }

  return (msd) => buildFlexFeed(msd);
}
