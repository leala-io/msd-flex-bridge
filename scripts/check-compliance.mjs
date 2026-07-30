#!/usr/bin/env node
// Compliance grep — public terminology and framing (blueprint C.3/6).
//
// Fails on: the forbidden terminology form for the schema version, any
// configured institutional acronym, any configured contest or programme
// branding, and any path-scoped token (country framing in the README). The
// tokens themselves live in scripts/compliance-blocklist.json.
//
// Scope is TRACKED FILES ONLY, via `git ls-files`. CLAUDE.md and .claude/ are
// untracked and contain the forbidden forms deliberately, in order to forbid
// them; a naive scan of the working tree would flag the guardrails themselves.
// Binary files are skipped by content, not by extension guesswork.
//
// The blocklist file is exempt from its own scan for the same reason: it must
// name each forbidden form in order to forbid it. That is one file, named
// explicitly below, not a general escape hatch.
//
// Matching is case-insensitive with word boundaries, so a token is neither
// missed through capitalisation nor matched inside a longer word.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const blocklist = JSON.parse(readFileSync(join(repoRoot, 'scripts', 'compliance-blocklist.json'), 'utf8'));

/** Escape a literal token, then bound it with \b where the edges are word characters. */
function tokenPattern(token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const left = /^\w/.test(token) ? '\\b' : '';
  const right = /\w$/.test(token) ? '\\b' : '';
  return new RegExp(`${left}${escaped}${right}`, 'gi');
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const isBinary = (bytes) => bytes.includes(0x00);

/** The blocklist names every forbidden form and cannot be scanned for them. */
const SELF_EXEMPT = new Set(['scripts/compliance-blocklist.json']);

const findings = [];

for (const relPath of tracked) {
  if (SELF_EXEMPT.has(relPath)) continue;
  let bytes;
  try {
    bytes = readFileSync(join(repoRoot, relPath));
  } catch {
    continue; // deleted from the working tree but still in the index
  }
  if (isBinary(bytes)) continue;
  const text = bytes.toString('utf8');
  const lines = text.split('\n');

  const rules = [
    ...blocklist.terminology.map((e) => ({ ...e, category: 'terminology' })),
    ...blocklist.institutional.map((e) => ({ ...e, category: 'institutional acronym' })),
    ...blocklist.contest.map((e) => ({ ...e, category: 'contest branding' })),
    ...blocklist.scoped
      .filter((e) => e.paths.includes(relPath))
      .map((e) => ({ ...e, category: 'scoped framing' })),
  ];

  for (const rule of rules) {
    const pattern = tokenPattern(rule.token);
    lines.forEach((line, i) => {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        findings.push({
          file: relPath,
          line: i + 1,
          category: rule.category,
          token: rule.token,
          why: rule.why,
          text: line.trim().slice(0, 120),
        });
      }
    });
  }
}

const counts = {
  terminology: blocklist.terminology.length,
  institutional: blocklist.institutional.length,
  contest: blocklist.contest.length,
  scoped: blocklist.scoped.length,
};

console.log(
  `compliance grep — ${tracked.length} tracked files scanned; tokens configured: `
  + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', '),
);
if (counts.institutional === 0 || counts.contest === 0) {
  console.log(
    'note: the institutional and/or contest token lists are empty, so those categories '
    + 'assert nothing yet — add tokens to scripts/compliance-blocklist.json.',
  );
}

if (findings.length) {
  console.error(`\ncompliance grep FAILED — ${findings.length} occurrence(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  [${f.category}] "${f.token}"`);
    console.error(`      ${f.text}`);
    console.error(`      ${f.why}`);
  }
  process.exit(1);
}

console.log('compliance grep passed');
