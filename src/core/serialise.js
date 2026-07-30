/**
 * serialise.js — canonical JSON writer
 *
 * Pure. Identical input must produce byte-identical output, and that
 * requirement is stated here in full because it is enforced in several places
 * at once and nowhere else written down:
 *
 *   1. No wall clock and no randomness anywhere on the core path: no reader of
 *      the current time, no high-resolution timer, no pseudo-random source and
 *      no random identifier generator. The exact call forms are enumerated in
 *      scripts/check-purity.mjs, which fails the build on any of them — and
 *      which matches on text, so they are described here rather than quoted.
 *      `last_updated` comes from the documented cascade over feed content,
 *      never from the system clock.
 *   2. Canonical form is `JSON.stringify(doc, null, 2) + '\n'` — two-space
 *      indent, one trailing newline, no replacer function.
 *   3. Key order is fixed **by construction**: objects are built in a literal
 *      order in lift.js, matching the schema's own property order. Nothing is
 *      sorted at write time, here or anywhere, so the order is a property of
 *      the code rather than of the data it happens to receive.
 *   4. Non-ASCII is written raw. JSON.stringify does not escape it and the file
 *      is UTF-8, so Japanese characters appear literally rather than as \uXXXX.
 *   5. No locale-dependent operation is used on the core path — no
 *      toLocaleString, no Intl, no localeCompare — since each of those can
 *      produce different bytes on different machines.
 *
 * Two gates hold this: two consecutive lifts of one input are compared to each
 * other, and a fresh lift is compared byte-for-byte against a committed
 * snapshot.
 */

export function serialise(doc) {
  return JSON.stringify(doc, null, 2) + '\n';
}
