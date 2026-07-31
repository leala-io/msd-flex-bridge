#!/usr/bin/env node
// Canonical GTFS validator over both sides of the roundtrip.
//
// NETWORK EXCEPTION — the only one in this repository.
// CLAUDE.md § 5 states that nothing here reaches the network at runtime or in
// CI. This step is the single, explicit exception, and it holds on three
// conditions, all enforced below:
//
//   1. fetched by pinned version — never "latest", never a moving tag;
//   2. sha256 verified after download, and a mismatch fails the step, so the
//      interoperability claim never rests on whatever a server returned today;
//   3. the artefact is git-ignored and never committed (40 MB, not vendorable
//      at a sensible size).
//
// Nothing else in this repository fetches anything. The core makes no network
// call, the drift check and the terminology check are offline by construction,
// and `npm ci` is the only other step that reaches a registry.
//
// DETERMINISM — the validator defaults to the *current date* for time-based
// rules such as feed expiration, which would make its output change from one
// day to the next for unchanged input. Both the validation date and the country
// code are therefore derived from the feed itself:
//
//   date          the lifted document's `last_updated`, which comes from the
//                 feed's own `feed_version` through the documented cascade
//   country code  the lifted document's `provider.country`
//
// The date is not chosen to suit the result. A different date produces a
// different notice set — notably around calendar coverage — and the date that
// the feed asserts about itself is the only one this repository can defend.
// `--skip_validator_update` keeps the validator from phoning home as well.
//
// Usage:  node scripts/gtfs-validator.mjs [feed-dir-root]
// Exit:   0 the generated feed has no ERROR-severity notice | 1 it has | 3 setup

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';

import { liftFlexToMsd } from '../src/core/lift.js';

/* ------------------------------------------------------------ the pin ---- */

const VERSION = '8.0.1';
const JAR_NAME = `gtfs-validator-${VERSION}-cli.jar`;
const JAR_URL =
  `https://github.com/MobilityData/gtfs-validator/releases/download/v${VERSION}/${JAR_NAME}`;
const JAR_SHA256 = '19293ddd9b6f954f216d4f12054bd8a3232921751c4484339e339764a91000e2';
const JAR_BYTES = 40256884;

const FIXTURE = 'test/fixtures/mizuho/Mizuho_Area-20260202.zip';
const root = process.argv[2] ?? 'build/roundtrip';
const jarPath = join('build', JAR_NAME);

/* ------------------------------------------------- fetch, then verify ---- */

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function ensureJar() {
  if (!existsSync(jarPath)) {
    console.log(`fetching ${JAR_NAME} (pinned v${VERSION})`);
    const response = await fetch(JAR_URL);
    if (!response.ok) {
      console.error(`cannot fetch the validator: ${response.status} ${response.statusText}`);
      process.exit(3);
    }
    mkdirSync('build', { recursive: true });
    writeFileSync(jarPath, Buffer.from(await response.arrayBuffer()));
  }

  // Verified on every run, not only after a download: a cached jar is as
  // unverified as a freshly fetched one.
  const bytes = readFileSync(jarPath);
  const got = sha256(bytes);
  if (bytes.length !== JAR_BYTES || got !== JAR_SHA256) {
    console.error('validator jar FAILED verification — refusing to run it');
    console.error(`  expected ${JAR_SHA256}  ${JAR_BYTES} bytes`);
    console.error(`  got      ${got}  ${bytes.length} bytes`);
    console.error('An unverified download would make the interoperability claim rest on');
    console.error('whatever the server returned today. Delete the file and retry.');
    process.exit(3);
  }
  console.log(`validator v${VERSION} verified — sha256 ${got}`);
}

/* ----------------------------------------------------------- run it ----- */

function validate(feedDir, outBase, { countryCode, date }) {
  execFileSync('java', [
    '-jar', jarPath,
    '--input', feedDir,
    '--output_base', outBase,
    '--country_code', countryCode,
    '--date', date,
    '--skip_validator_update',
    '--pretty',
  ], { stdio: 'pipe' });

  const report = JSON.parse(readFileSync(join(outBase, 'report.json'), 'utf8'));
  const byCode = report.notices.map((n) => ({
    code: n.code,
    severity: n.severity,
    count: n.totalNotices,
  })).sort((a, b) => a.code.localeCompare(b.code));

  const total = byCode.reduce((sum, n) => sum + n.count, 0);
  const errors = byCode.filter((n) => n.severity === 'ERROR').reduce((s, n) => s + n.count, 0);

  return { byCode, total, errors };
}

const show = (label, result) => {
  console.log(`\n${label}: ${result.total} notice(s), ${result.errors} of them ERROR`);
  if (result.byCode.length === 0) console.log('  (none)');
  for (const n of result.byCode) {
    console.log(`  ${String(n.count).padStart(4)}  ${n.severity.padEnd(8)}  ${n.code}`);
  }
};

/* -------------------------------------------------------------- main ---- */

await ensureJar();

const { msd } = await liftFlexToMsd(new Uint8Array(readFileSync(FIXTURE)));
const countryCode = msd.provider.country.toLowerCase();
const date = msd.last_updated.slice(0, 10);

console.log(`validating with country_code=${countryCode} date=${date} (both derived from the feed)`);

// The original is validated too. The result is informative either way, and it is
// a fact about a published feed — never a criticism of a publisher.
const original = validate(join(root, 'original'), join(root, 'validator-original'),
  { countryCode, date });
const generated = validate(join(root, 'generated'), join(root, 'validator-generated'),
  { countryCode, date });

show('original feed ', original);
show('generated feed', generated);

writeFileSync(join(root, 'validator-summary.json'),
  `${JSON.stringify({ version: VERSION, countryCode, date, original, generated }, null, 2)}\n`);

if (generated.errors > 0) {
  console.error(`\nFAIL — the generated feed carries ${generated.errors} ERROR-severity notice(s).`);
  process.exit(1);
}

console.log(`\nOK — the generated feed carries no ERROR-severity notice (${generated.total} notice(s) in total).`);
