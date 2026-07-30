#!/usr/bin/env node
// Regenerate the committed snapshots under test/fixtures/expected/.
//
// The snapshots are the fixture gate: the test suite compares a fresh lift
// against them byte-for-byte. Run this only when a change to the lift is
// intended, and read the diff — a snapshot that is regenerated without being
// read turns the gate into a rubber stamp.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

import { liftFlexToMsd } from '../src/core/lift.js';
import { serialise } from '../src/core/serialise.js';

const FIXTURE = 'test/fixtures/mizuho/Mizuho_Area-20260202.zip';
const OUT = 'test/fixtures/expected';

const { msd, residuals, diagnostics, refusal } = await liftFlexToMsd(
  new Uint8Array(readFileSync(FIXTURE)),
);

if (refusal !== null) {
  console.error(`the bundled fixture was refused: ${refusal.code} — ${refusal.message}`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/mizuho.msd.json`, serialise(msd));
writeFileSync(`${OUT}/mizuho.residuals.json`, serialise(residuals));
writeFileSync(`${OUT}/mizuho.diagnostics.json`, serialise(diagnostics));

console.log(`written to ${OUT}/`);
console.log(`  mizuho.msd.json          ${msd.services.length} service(s), ${msd.services[0].service_area.stops.length} stops`);
console.log(`  mizuho.residuals.json    ${residuals.length} entries`);
console.log(`  mizuho.diagnostics.json  ${Object.keys(diagnostics).length} top-level keys`);
