#!/usr/bin/env node
// Run the roundtrip end to end and write its artefacts.
//
//   original feed → lift → MSD document → export → generated feed → diff
//
// Writes, under a git-ignored build directory:
//   original/   the bundled feed unpacked verbatim, for the canonical validator
//   generated/  the feed the vendored exporter produces from the lifted document
//   report.json the structured diff, identical to the committed snapshot
//
// Offline and deterministic: no clock, no randomness, no network. Running it
// twice produces byte-identical output, which is what makes the committed
// snapshot meaningful.
//
// Usage:  node scripts/roundtrip.mjs [out-dir]

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import JSZip from 'jszip';

import { liftFlexToMsd } from '../src/core/lift.js';
import { serialise } from '../src/core/serialise.js';
import { diffFeeds } from '../src/core/roundtrip.js';
import { createFlexExporter } from '../src/export.js';
import { convert, buildFlexFeed } from '../vendor/msd-engine/engine.mjs';

const FIXTURE = 'test/fixtures/mizuho/Mizuho_Area-20260202.zip';
const outDir = process.argv[2] ?? 'build/roundtrip';

/** The bundled feed, unpacked verbatim — the left-hand side of the comparison. */
export async function readOriginal(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const files = {};
  for (const name of Object.keys(zip.files).sort()) {
    if (zip.files[name].dir) continue;
    files[name] = await zip.files[name].async('string');
  }
  return files;
}

/** The whole chain, as a function of bytes alone. */
export async function runRoundtrip(bytes) {
  const original = await readOriginal(bytes);

  const { msd, refusal } = await liftFlexToMsd(bytes);
  if (refusal !== null) {
    throw new Error(`the bundled fixture was refused: ${refusal.code} — ${refusal.message}`);
  }

  const { files: generated, warnings } = createFlexExporter({ convert, buildFlexFeed })(msd);

  return { original, generated, warnings, report: diffFeeds(original, generated) };
}

/* ------------------------------------------------------------------- main */

// Exported above so the test suite can run the same chain without this script's
// file writing; the CLI half runs only when the file is invoked directly.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const bytes = new Uint8Array(readFileSync(FIXTURE));
  const { original, generated, warnings, report } = await runRoundtrip(bytes);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'original'), { recursive: true });
  mkdirSync(join(outDir, 'generated'), { recursive: true });

  for (const [name, text] of Object.entries(original)) {
    writeFileSync(join(outDir, 'original', name), text);
  }
  for (const [name, text] of Object.entries(generated)) {
    writeFileSync(join(outDir, 'generated', name), text);
  }
  writeFileSync(join(outDir, 'report.json'), serialise(report));

  const t = report.totals;
  console.log(`roundtrip: ${Object.keys(original).length} original file(s) → ${Object.keys(generated).length} generated file(s)`);
  console.log(`  files only in the original   ${t.filesOnlyOriginal}  [${report.files.onlyOriginal.map((f) => f.file).join(' ')}]`);
  console.log(`  files only in the generated  ${t.filesOnlyGenerated}  [${report.files.onlyGenerated.map((f) => f.file).join(' ')}]`);
  console.log(`  rows matched                 ${t.rowsMatched}`);
  console.log(`  rows only in the original    ${t.rowsOnlyOriginal}`);
  console.log(`  rows only in the generated   ${t.rowsOnlyGenerated}`);
  console.log(`  field differences            ${t.fieldDifferences}`);
  if (warnings.length) for (const w of warnings) console.log(`  exporter warning: ${w}`);
  console.log(`written to ${outDir}/`);
}
