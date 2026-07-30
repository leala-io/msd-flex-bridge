#!/usr/bin/env node
/**
 * gen-blocklist.mjs — turn a private term list into a public hash blocklist
 *
 * WHY THIS EXISTS
 * A compliance gate needs to know which terms must never appear in the repository.
 * Committing those terms in clear text would defeat the purpose: a file listing a
 * handful of institutional acronyms reads as "terms this author may not use", which
 * is itself the disclosure the gate is meant to prevent.
 *
 * So the repository carries only SHA-256 hashes. The checker tokenises tracked files
 * at word boundaries, hashes each token, and tests membership. It works completely
 * and reveals nothing.
 *
 * This is not cryptographic secrecy — short acronyms are enumerable by anyone who
 * guesses the shape of the list. The point is narrower: do not publish a readable
 * list of forbidden words. A hash list looks like noise, and that is enough.
 *
 * SOURCE OF TRUTH
 * The clear-text list lives at .claude/compliance-terms.txt, which .gitignore keeps
 * out of the repository. It is NOT recoverable from the committed hashes. Keep a copy
 * with your project documents — losing it means rebuilding the list by hand.
 *
 * Usage:  node scripts/gen-blocklist.mjs
 *         node scripts/gen-blocklist.mjs --check    (verify without writing)
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SOURCE = '.claude/compliance-terms.txt';
const TARGET = 'scripts/compliance-blocklist.json';
const checkOnly = process.argv.includes('--check');

if (!existsSync(SOURCE)) {
  console.error(`missing ${SOURCE}`);
  console.error('This file is deliberately untracked. Restore it from your project documents.');
  process.exit(3);
}

/**
 * Two matching modes:
 *   folded — hashed lower-cased; the token is compared case-insensitively.
 *   exact  — hashed as written; matches only that exact casing.
 *
 * Exact mode exists for acronyms that collide with ordinary words. A three-letter
 * agency abbreviation that is also an English auxiliary verb, folded to lower case,
 * would fire on every English sentence; hashed as written, it fires on the acronym
 * and not on the verb.
 *
 * A scope name ending in `:exact` selects exact mode for that section.
 */
const hashFolded = s => createHash('sha256').update(s.trim().toLowerCase(), 'utf8').digest('hex');
const hashExact = s => createHash('sha256').update(s.trim(), 'utf8').digest('hex');

/* Parse: `# comment` lines ignored; `[scope]` opens a section; one term per line. */
const scopes = {};
let current = 'global';
for (const raw of readFileSync(SOURCE, 'utf8').split('\n')) {
  const line = raw.replace(/#.*$/, '').trim();
  if (!line) continue;
  const section = line.match(/^\[([a-z0-9_:-]+)\]$/i);
  if (section) { current = section[1].toLowerCase(); continue; }
  (scopes[current] ||= new Set()).add(line.trim());
}

const out = {
  _comment:
    'SHA-256 of forbidden tokens. The clear-text list is deliberately not in this repository. ' +
    'Regenerate with scripts/gen-blocklist.mjs. Scope "global" applies to every tracked file; ' +
    'any other scope applies only to files whose path contains that scope name. A scope ending ' +
    'in ":exact" is matched case-sensitively, for acronyms that collide with ordinary words.',
  algorithm: 'sha256(token, utf8) — folded scopes lower-case the token first',
  generated_from: SOURCE,
  scopes: {},
};
for (const [scope, terms] of Object.entries(scopes)) {
  const h = scope.endsWith(':exact') ? hashExact : hashFolded;
  out.scopes[scope] = [...terms].map(h).sort();
}

const json = JSON.stringify(out, null, 2) + '\n';

if (checkOnly) {
  const existing = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : '';
  if (existing === json) {
    console.log(`blocklist is current (${Object.entries(out.scopes).map(([s, h]) => `${s}:${h.length}`).join(' ')})`);
    process.exit(0);
  }
  console.error(`${TARGET} is out of date — run: node scripts/gen-blocklist.mjs`);
  process.exit(1);
}

writeFileSync(TARGET, json);
for (const [scope, hashes] of Object.entries(out.scopes)) {
  console.log(`${scope.padEnd(10)} ${hashes.length} term(s)`);
}
console.log(`written: ${TARGET}`);
console.log('The clear-text source stays untracked. Keep a copy outside this repository.');
