#!/usr/bin/env node
// Purity check — src/core/** must stay pure and deterministic.
//
// Two families of violation:
//   1. host imports — fs, path, child_process, process, os, url
//   2. wall clock and randomness — Date.now(), new Date() with no argument,
//      performance.now(), Math.random(), crypto.randomUUID()
//
// Matching is import- and call-based with word boundaries, never substring:
// `filepath`, `pathname` and `process_row` are ordinary identifiers and must
// not trigger it. The analyser is exported so the test suite can hold it to
// that promise from both sides — a real violation must fail, a lookalike must
// pass.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const HOST_MODULES = ['fs', 'path', 'child_process', 'process', 'os', 'url'];

/** node:fs, fs/promises, node:fs/promises — all the same forbidden module. */
const moduleMatches = (specifier) => {
  const bare = specifier.replace(/^node:/, '').split('/')[0];
  return HOST_MODULES.includes(bare);
};

const IMPORT_PATTERNS = [
  // import … from 'x' / import 'x' / export … from 'x'
  /(?:^|[\s;}])(?:import|export)\b[^'"`;]*?from\s*['"]([^'"]+)['"]/g,
  /(?:^|[\s;}])import\s*['"]([^'"]+)['"]/g,
  // require('x') and dynamic import('x') — word boundary, so `myrequire(` misses
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const CALL_PATTERNS = [
  { name: 'Date.now()', re: /\bDate\s*\.\s*now\s*\(/g },
  { name: 'new Date() without argument', re: /\bnew\s+Date\s*\(\s*\)/g },
  { name: 'performance.now()', re: /\bperformance\s*\.\s*now\s*\(/g },
  { name: 'Math.random()', re: /\bMath\s*\.\s*random\s*\(/g },
  { name: 'crypto.randomUUID()', re: /\bcrypto\s*\.\s*randomUUID\s*\(/g },
  // A bare reference to the process global: `process.env`, never `process_row`.
  { name: 'process global', re: /\bprocess\s*\.\s*[A-Za-z_$]/g },
];

/** Line number of an index into the source, 1-based. */
const lineOf = (source, index) => source.slice(0, index).split('\n').length;

/**
 * Analyse one source file.
 * @returns {Array<{file: string, line: number, kind: string, detail: string}>}
 */
export function analyse(source, file = '<input>') {
  const findings = [];

  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      if (moduleMatches(match[1])) {
        findings.push({
          file,
          line: lineOf(source, match.index),
          kind: 'host import',
          detail: `imports "${match[1]}"`,
        });
      }
    }
  }

  for (const { name, re } of CALL_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source)) !== null) {
      findings.push({
        file,
        line: lineOf(source, match.index),
        kind: 'non-determinism',
        detail: name,
      });
    }
  }

  return findings;
}

/* ------------------------------------------------------------------- main */

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const coreDir = join(repoRoot, 'src', 'core');

  const walk = (dir) => {
    let files = [];
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) files = files.concat(walk(full));
      else if (entry.endsWith('.js') || entry.endsWith('.mjs')) files.push(full);
    }
    return files;
  };

  let files = [];
  try {
    files = walk(coreDir);
  } catch {
    console.error('purity: src/core/ not found');
    process.exit(1);
  }

  const findings = files.flatMap((f) =>
    analyse(readFileSync(f, 'utf8'), relative(repoRoot, f)));

  if (findings.length) {
    console.error(`purity check FAILED — ${findings.length} violation(s):\n`);
    for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.kind}: ${f.detail}`);
    console.error('\nsrc/core/** must stay pure and deterministic: the core takes bytes and');
    console.error('returns values, so it stays portable to a browser, and identical input must');
    console.error('produce byte-identical output. Host access belongs in src/cli.js.');
    process.exit(1);
  }

  console.log(`purity check passed — ${files.length} file(s) under src/core/ are clean`);
}
