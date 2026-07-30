/**
 * serialise.js — canonical JSON writer
 *
 * Pure. Identical input must produce byte-identical output (blueprint C.0/8).
 *
 * `JSON.stringify(doc, null, 2) + '\n'`, no replacer, no sorting. Key order is
 * fixed by construction in lift.js — objects are built in a literal order — so
 * nothing is reordered here. Non-ASCII is written raw: JSON.stringify does not
 * escape it, and the file is UTF-8, so Japanese characters appear literally
 * rather than as \uXXXX.
 */

export function serialise(doc) {
  return JSON.stringify(doc, null, 2) + '\n';
}
