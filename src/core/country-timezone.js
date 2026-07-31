/**
 * country-timezone.js — the export direction's country table, extended (P2/B.2)
 *
 * GTFS requires `agency_timezone`. MSD carries no timezone field, so the
 * vendored exporter derives one from `provider.country` through an explicit
 * table and returns null — which makes the caller abort — for a country it does
 * not know. It refuses to guess, and that refusal is correct: a wrong timezone
 * shifts every operating window silently.
 *
 * The reference case is unmapped upstream, so the table needs one addition. The
 * addition is **bridge code and stays bridge code**: upstream is read-only, and
 * a country mapping is not a schema question. It is applied by injection at run
 * time (src/export.js) — not one vendored byte changes.
 *
 * Two properties this module must keep:
 *
 *   - **Additive only.** Upstream's answer wins wherever upstream has one, so
 *     the bridge can never silently contradict the exporter it vendored.
 *   - **Still aborts.** An unknown country returns null, exactly as before. The
 *     failure mode to avoid is a lookup that falls back to a default: it would
 *     turn "we do not know" into a confident wrong answer, and no test downstream
 *     would notice. test/export.test.js holds this from both sides.
 *
 * Pure: no host imports, no wall clock, no randomness.
 */

/**
 * Additions to the vendored exporter's country → IANA timezone table.
 *
 * Single-zone countries only, matching the upstream table's own stated
 * constraint. A country with more than one zone cannot be resolved from the
 * country code alone, and would have to abort rather than pick one.
 *
 * - `JP` — Japan observes a single zone (UTC+09:00) nationwide, with no daylight
 *   saving. Recorded in docs/mapping.md as a documented assumption of the export
 *   direction, not as a fact the feed asserts.
 */
export const BRIDGE_COUNTRY_TIMEZONES = Object.freeze({
  JP: 'Asia/Tokyo',
});

/** Own-property lookup: `country` is feed-derived and must not reach the prototype. */
const bridgeLookup = (country) =>
  (Object.prototype.hasOwnProperty.call(BRIDGE_COUNTRY_TIMEZONES, country)
    ? BRIDGE_COUNTRY_TIMEZONES[country]
    : null);

/**
 * Wrap the exporter's own resolver so the bridge's additions are consulted only
 * where upstream has no answer.
 *
 * @param {(country: string) => (string|null)} upstreamResolver
 * @returns {(country: string) => (string|null)} null for an unmapped country — the caller aborts
 */
export function extendCountryTimezone(upstreamResolver) {
  if (typeof upstreamResolver !== 'function') {
    throw new TypeError('extendCountryTimezone requires the exporter’s own resolver');
  }
  return (country) => upstreamResolver(country) ?? bridgeLookup(country);
}
