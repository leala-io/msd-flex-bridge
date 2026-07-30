#!/usr/bin/env node
// Vendor drift check — offline, no network.
//
// Parses the hash table in docs/dependency.md, recomputes the sha256 and byte
// size of every listed file under vendor/msd/, and fails on any mismatch. Also
// fails if the set of vendored files on disk does not exactly match the table
// (a file added to or removed from vendor/msd/ — other than the two repo-owned
// files COMMIT and core.mjs — is drift).
//
// This is the guard that keeps the vendored artefacts byte-identical to upstream
// at the pinned commit. A mismatch is a hard failure, never a warning.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const depDoc = join(repoRoot, 'docs', 'dependency.md');
const vendorDir = join(repoRoot, 'vendor', 'msd');

// Files under vendor/msd/ that are this repository's own, not vendored artefacts.
const REPO_OWNED = new Set([
  'vendor/msd/COMMIT',
  'vendor/msd/core.mjs',
  // Scope marker, not a vendored artefact. The root package.json sets
  // "type": "module", which makes Node treat every .js under this package as
  // ESM — including the vendored CommonJS core.js, even when loaded through
  // createRequire. This one-key file restores CommonJS semantics for that
  // directory without touching a single vendored byte. See docs/dependency.md.
  'vendor/msd/package.json',
]);

const fail = (msg) => {
  console.error(`vendor-drift: FAIL — ${msg}`);
  process.exit(1);
};

// --- Parse the table rows: | upstream | `local` | `sha256` | bytes | ---
const md = readFileSync(depDoc, 'utf8');
const expected = new Map(); // localPath -> { sha256, bytes }
for (const line of md.split('\n')) {
  const m = line.match(
    /\|\s*`([^`]+)`\s*\|\s*`(vendor\/msd\/[^`]+)`\s*\|\s*`([0-9a-f]{64})`\s*\|\s*(\d+)\s*\|/,
  );
  if (m) expected.set(m[2], { sha256: m[3], bytes: Number(m[4]) });
}
if (expected.size === 0) fail(`no hash-table rows parsed from ${relative(repoRoot, depDoc)}`);

// --- Enumerate the vendored files actually on disk ---
const onDisk = new Set();
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = relative(repoRoot, abs);
    if (statSync(abs).isDirectory()) walk(abs);
    else if (!REPO_OWNED.has(rel)) onDisk.add(rel);
  }
};
walk(vendorDir);

// --- Set equality: table vs disk ---
for (const rel of onDisk) {
  if (!expected.has(rel)) fail(`file on disk is not in the table (unexpected vendored file): ${rel}`);
}
for (const rel of expected.keys()) {
  if (!onDisk.has(rel)) fail(`file listed in the table is missing on disk: ${rel}`);
}

// --- Content + size comparison ---
let checked = 0;
for (const [rel, want] of expected) {
  const bytes = readFileSync(join(repoRoot, rel));
  const got = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== want.bytes) fail(`byte size mismatch for ${rel}: expected ${want.bytes}, got ${bytes.length}`);
  if (got !== want.sha256) fail(`sha256 mismatch for ${rel}:\n  expected ${want.sha256}\n  got      ${got}`);
  checked += 1;
}

console.log(`vendor-drift: OK — ${checked} vendored file(s) match docs/dependency.md`);
