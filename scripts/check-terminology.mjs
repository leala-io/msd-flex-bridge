#!/usr/bin/env node
/**
 * check-terminology.mjs — terminology check over tracked files
 *
 * Fails the build when a tracked file states the version relationship wrongly.
 * The schema is v0.1.0; v0.1.1 is the release that publishes it. Writing
 * "v0.1.1 schema" conflates two different version numbers for two different
 * things, and it has happened three times in this project.
 *
 * The pattern is stated in clear text on purpose: it describes a mistake, not a
 * protected term, so there is nothing to conceal and a reader can see exactly
 * what the check enforces.
 *
 * SCOPE — tracked files only, excluding vendor/. Both exclusions are deliberate.
 *
 * Tracked only: this repository's guardrail documents are untracked and name the
 * wrong form precisely in order to forbid it. A naive walk of the working tree
 * would flag the guardrails themselves and the check would be discarded as noise.
 *
 * Not vendor/: vendored files are verbatim copies whose byte-identity the drift
 * check enforces. Their content is a fact about the upstream project, not a
 * statement by this repository, and it cannot be edited even if a wrong form
 * appears in it. A check that flags something unchangeable blocks permanently
 * and teaches people to bypass it.
 *
 * Usage:  node scripts/check-terminology.mjs
 * Exit:   0 clean | 1 violation found | 3 setup problem
 */

import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname } from 'node:path';

const PATTERNS = [
  {
    name: 'schema/release version confusion',
    re: /v0\.1\.1\s+schema/gi,
    hint: 'the schema is v0.1.0; v0.1.1 is the release that publishes it',
  },
];

const SKIP_PATHS = [/^vendor\//];
const SKIP_EXT = new Set(['.zip', '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.ico', '.woff', '.woff2']);
const NUL = String.fromCharCode(0);

let files;
try {
  files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
} catch {
  console.error('cannot list tracked files — is this a git repository?');
  process.exit(3);
}

const violations = [];
let scanned = 0;

for (const path of files) {
  if (SKIP_PATHS.some((re) => re.test(path))) continue;
  if (SKIP_EXT.has(extname(path).toLowerCase())) continue;
  let stat;
  try { stat = statSync(path); } catch { continue; }
  if (!stat.isFile() || stat.size > 4 * 1024 * 1024) continue;

  let text;
  try { text = readFileSync(path, 'utf8'); } catch { continue; }
  if (text.includes(NUL)) continue;   // binary
  scanned++;

  text.split('\n').forEach((line, i) => {
    for (const { name, re, hint } of PATTERNS) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) {
        violations.push({ path, line: i + 1, col: m.index + 1, token: m[0], name, hint });
      }
    }
  });
}

console.log(`terminology: ${scanned} tracked file(s) scanned against ${PATTERNS.length} pattern(s)`);

if (!violations.length) {
  console.log('terminology: clean');
  process.exit(0);
}

console.error(`\nterminology: ${violations.length} violation(s)\n`);
for (const v of violations) {
  console.error(`  ${v.path}:${v.line}:${v.col}  "${v.token}"  (${v.name}) — ${v.hint}`);
}
process.exit(1);
