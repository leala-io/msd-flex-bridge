#!/usr/bin/env node
// Render the service card from the bundled feed.
//
//   feed → lift → document + residual register → card/index.html
//
// The stylesheet beside it, card/card.css, is written by hand and is not
// generated. Both files are committed so a reader of the repository can open the
// card without running anything, and the test suite asserts that the committed
// HTML is exactly what a fresh render produces.
//
// Offline and deterministic: no clock, no randomness, no network. The card opens
// from the file system.
//
// Usage:  node scripts/build-card.mjs [out-dir]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { liftFlexToMsd } from '../src/core/lift.js';
import { renderCard } from '../src/core/card.js';
import { en } from '../src/core/card-strings.js';

const FIXTURE = 'test/fixtures/mizuho/Mizuho_Area-20260202.zip';
const outDir = process.argv[2] ?? 'card';

/** The card as a function of bytes alone, so the test can call it too. */
export async function buildCard(bytes) {
  const { msd, residuals, refusal } = await liftFlexToMsd(bytes);
  if (refusal !== null) {
    throw new Error(`the bundled fixture was refused: ${refusal.code} — ${refusal.message}`);
  }
  // The diagnostics are deliberately not passed on: they record what the source
  // said and what the lift decided, which is not a description of the service.
  return renderCard({ msd, residuals, strings: en });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const html = await buildCard(new Uint8Array(readFileSync(FIXTURE)));

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html);

  console.log(`written: ${join(outDir, 'index.html')} (${html.length} characters)`);
  console.log(`open it with: open ${join(outDir, 'index.html')}`);
}
