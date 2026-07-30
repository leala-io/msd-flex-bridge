#!/usr/bin/env node
/**
 * cli.js — the thin wrapper (P1.6)
 *
 * The only file in this repository where fs, path and process are permitted.
 * It reads bytes from disk, calls the pure core, and writes bytes back. No
 * mapping, no classification, no residual construction: everything that decides
 * anything about a feed lives in src/core/**, which the purity gate keeps free
 * of this file's imports.
 *
 * The validator is injected here, not imported by the core — the schema and the
 * 14 registry code lists are read from vendor/msd/ and handed in, so the core
 * stays browser-portable and the validation path stays swappable in tests.
 *
 *   msd-flex-bridge lift <feed.zip | feed-dir> [-o out.msd.json]
 *                        [--residuals out.residuals.json]
 *                        [--diagnostics out.diagnostics.json]
 *
 * The document goes to stdout unless -o is given, and nothing else ever does,
 * so `msd-flex-bridge lift feed.zip > out.json` produces a usable file. Every
 * message goes to stderr.
 *
 * Exit: 0 pass · 1 validation failure · 2 refused kind · 3 read or usage error.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { liftFlexToMsd } from './core/lift.js';
import { serialise } from './core/serialise.js';
import { validateDocument } from './core/validate.js';
import { validateMsd, formatErrors } from '../vendor/msd/core.mjs';

const EXIT_OK = 0;
const EXIT_INVALID = 1;
const EXIT_REFUSED = 2;
const EXIT_READ = 3;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `msd-flex-bridge — read a GTFS-Flex feed of the location-group kind and lift it into an MSD file

usage:
  msd-flex-bridge lift <feed.zip | feed-dir> [options]

options:
  -o, --out <file>          write the MSD document to a file instead of stdout
      --residuals <file>    write the residual report as JSON
      --diagnostics <file>  write the diagnostics as JSON
  -h, --help                show this text

exit codes:
  0  the document was produced and passes validation
  1  the document was produced but fails validation
  2  the feed is not of the accepted kind and was refused, with a named reason
  3  the input could not be read, or the command line was not understood
`;

const err = (...args) => process.stderr.write(`${args.join(' ')}\n`);

/* ------------------------------------------------------------ argument parsing */

function parseArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help')) return { help: true };

  const [command, ...rest] = argv;
  if (command === undefined) return { error: 'no command given' };
  if (command !== 'lift') return { error: `unknown command "${command}"` };

  const options = { command, input: null, out: null, residuals: null, diagnostics: null };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const takesValue = ['-o', '--out', '--residuals', '--diagnostics'].includes(arg);

    if (takesValue) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('-')) return { error: `${arg} needs a file path` };
      if (arg === '-o' || arg === '--out') options.out = value;
      else if (arg === '--residuals') options.residuals = value;
      else options.diagnostics = value;
      i++;
    } else if (arg.startsWith('-')) {
      return { error: `unknown option "${arg}"` };
    } else if (options.input === null) {
      options.input = arg;
    } else {
      return { error: `unexpected extra argument "${arg}"` };
    }
  }

  if (options.input === null) return { error: 'no feed given' };
  return options;
}

/* ------------------------------------------------------------------ reading */

/**
 * Read the input as the core wants it: zip bytes, or a map of { filename ->
 * bytes } for a directory. The core never sees a path.
 */
function readInput(path) {
  const stat = statSync(path);
  if (!stat.isDirectory()) return new Uint8Array(readFileSync(path));

  const files = {};
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (!statSync(full).isFile()) continue;
    files[name] = new Uint8Array(readFileSync(full));
  }
  return files;
}

function loadValidator() {
  const schema = JSON.parse(
    readFileSync(join(packageRoot, 'vendor/msd/schema/v0.1.0/msd.schema.json'), 'utf8'),
  );
  const registryDir = join(packageRoot, 'vendor/msd/registry/v0.1.0');
  const registry = readdirSync(registryDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(registryDir, f), 'utf8')));

  return { validateMsd, formatErrors, schema, registry };
}

/* --------------------------------------------------------------------- main */

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  process.stdout.write(USAGE);
  process.exit(EXIT_OK);
}
if (options.error) {
  err(`msd-flex-bridge: ${options.error}\n`);
  err(USAGE);
  process.exit(EXIT_READ);
}

let input;
try {
  input = readInput(options.input);
} catch (e) {
  err(`msd-flex-bridge: cannot read ${options.input}: ${e.message}`);
  process.exit(EXIT_READ);
}

const { msd, residuals, diagnostics, refusal } = await liftFlexToMsd(input);

// A feed that could not be read at all is a read error, not a refusal: the
// reader records it as a diagnostic and the fence then has nothing to classify.
const unreadable = (diagnostics.read ?? []).find(
  (d) => d.code === 'unreadable_archive' || d.code === 'no_input' || d.code === 'unsupported_input',
);
if (unreadable !== undefined) {
  err(`msd-flex-bridge: ${unreadable.message}`);
  process.exit(EXIT_READ);
}

if (refusal !== null) {
  err(`msd-flex-bridge: refused — ${refusal.message}`);
  err('');
  err(`  reason code: ${refusal.code}`);
  err(`  evidence:    ${JSON.stringify(refusal.evidence)}`);
  err('');
  err('This feed is not of the kind this bridge accepts. Nothing was written.');
  process.exit(EXIT_REFUSED);
}

/* ------------------------------------------------------------------ outputs */

const document = serialise(msd);

if (options.out !== null) writeFileSync(options.out, document);
else process.stdout.write(document);

if (options.residuals !== null) writeFileSync(options.residuals, serialise(residuals));
if (options.diagnostics !== null) writeFileSync(options.diagnostics, serialise(diagnostics));

/* --------------------------------------------------------------- validation */

const result = validateDocument(msd, loadValidator());

if (result.valid) {
  err(`msd-flex-bridge: PASS — validates against MSD schema v0.1.0 (release v0.1.1)`);
  err(`  services: ${msd.services.length}  ·  residuals: ${residuals.length}`);
  if (options.out !== null) err(`  document: ${options.out}`);
  if (options.residuals !== null) err(`  residuals: ${options.residuals}`);
  if (options.diagnostics !== null) err(`  diagnostics: ${options.diagnostics}`);
  process.exit(EXIT_OK);
}

// The document is still written: an invalid document is the thing a reader
// needs in order to see why it is invalid. The messages are the validator's own.
err('msd-flex-bridge: FAIL — the document does not validate');
err('');
for (const message of result.messages) err(`  ${message}`);
process.exit(EXIT_INVALID);
