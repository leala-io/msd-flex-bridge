#!/usr/bin/env node
/**
 * check-compliance.mjs — compliance gate over tracked files
 *
 * Fails the build when a tracked file contains a forbidden token. The forbidden
 * terms are known only as SHA-256 hashes (scripts/compliance-blocklist.json); see
 * scripts/gen-blocklist.mjs for why.
 *
 * SCOPE — tracked files only, excluding vendor/. Both exclusions are deliberate.
 *
 * Tracked only: the repository's own guardrail documents are untracked and name the
 * forbidden forms precisely in order to forbid them. A naive walk of the working
 * tree would flag the guardrails themselves and the gate would be discarded as noise.
 *
 * Not vendor/: vendored files are verbatim copies whose byte-identity the drift check
 * enforces. Their content is a fact about the upstream project, not a statement by
 * this repository, and it cannot be edited even if a term appears in it. A gate that
 * flags something unchangeable blocks permanently and teaches people to bypass it.
 *
 * Also checks literal patterns that are safe to state openly — version-string
 * mistakes and similar — which need no concealment.
 *
 * Usage:  node scripts/check-compliance.mjs
 * Exit:   0 clean | 1 violation found | 3 setup problem
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname } from 'node:path';

const BLOCKLIST = 'scripts/compliance-blocklist.json';

/* Patterns that are safe to name in the open: they describe a mistake, not a
   protected term. Kept here rather than in the hashed list so a reader can see
   what the gate enforces. */
const LITERAL_PATTERNS = [
  { name: 'schema/release version confusion', re: /v0\.1\.1\s+schema/gi,
    hint: 'the schema is v0.1.0; v0.1.1 is the release that publishes it' },
];

const SKIP_PATHS = [/^vendor\//];
const SKIP_EXT = new Set(['.zip', '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.ico', '.woff', '.woff2']);

if (!existsSync(BLOCKLIST)) {
  console.error(`missing ${BLOCKLIST} — run: node scripts/gen-blocklist.mjs`);
  process.exit(3);
}
const blocklist = JSON.parse(readFileSync(BLOCKLIST, 'utf8'));
const sets = Object.fromEntries(
  Object.entries(blocklist.scopes).map(([scope, hashes]) => [scope, new Set(hashes)]),
);
/** A scope ending in ":exact" compares the token as written; others fold to lower case. */
const isExact = scope => scope.endsWith(':exact');
/** The path filter of a scope: the part before any ":mode" suffix. "global" means everywhere. */
const scopePath = scope => scope.replace(/:[a-z]+$/, '');
const totalTerms = Object.values(sets).reduce((n, s) => n + s.size, 0);

let files;
try {
  files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
} catch (e) {
  console.error('cannot list tracked files — is this a git repository?');
  process.exit(3);
}

const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');

/** Which hash sets apply to this path? Every "global*" scope, plus any scope named in the path. */
const setsFor = path => {
  const lower = path.toLowerCase();
  const applicable = [];
  for (const [scope, set] of Object.entries(sets)) {
    const filter = scopePath(scope);
    if (filter === 'global' || lower.includes(filter)) applicable.push([scope, set]);
  }
  return applicable;
};

/* Tokenise on letters, digits and the few symbols that can be part of a name.
   Unicode-aware so non-Latin text tokenises sensibly rather than collapsing. */
const TOKEN = /[\p{L}\p{N}+_-]+/gu;

const violations = [];
let scanned = 0;

for (const path of files) {
  if (SKIP_PATHS.some(re => re.test(path))) continue;
  if (SKIP_EXT.has(extname(path).toLowerCase())) continue;
  let stat;
  try { stat = statSync(path); } catch { continue; }
  if (!stat.isFile() || stat.size > 4 * 1024 * 1024) continue;

  let text;
  try { text = readFileSync(path, 'utf8'); } catch { continue; }
  if (text.includes('\u0000')) continue;   // binary
  scanned++;

  const applicable = setsFor(path);
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    for (const m of line.matchAll(TOKEN)) {
      const folded = sha(m[0].toLowerCase());
      const exact = sha(m[0]);
      for (const [scope, set] of applicable) {
        if (set.has(isExact(scope) ? exact : folded)) {
          violations.push({ path, line: i + 1, col: m.index + 1, token: m[0], scope, kind: 'blocked term' });
        }
      }
    }
    for (const { name, re, hint } of LITERAL_PATTERNS) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) {
        violations.push({ path, line: i + 1, col: m.index + 1, token: m[0], scope: name, kind: hint });
      }
    }
  });
}

const scopeSummary = Object.entries(sets).map(([s, set]) => `${s}:${set.size}`).join(' ');
console.log(`compliance: ${scanned} tracked file(s) scanned against ${totalTerms} term(s) [${scopeSummary}] + ${LITERAL_PATTERNS.length} literal pattern(s)`);

if (totalTerms === 0) {
  console.error('WARNING: the blocklist is empty — the gate is a no-op until terms are configured.');
}

if (!violations.length) {
  console.log('compliance: clean');
  process.exit(0);
}

console.error(`\ncompliance: ${violations.length} violation(s)\n`);
for (const v of violations) {
  console.error(`  ${v.path}:${v.line}:${v.col}  "${v.token}"  (${v.scope}) — ${v.kind}`);
}
console.error(
  '\nNote: if this fired in CI rather than locally, the term is already in the published history. ' +
  'Removing it from the working tree does not remove it from earlier commits.',
);
process.exit(1);
