/**
 * cli.test.js — the wrapper, end to end (P1.6)
 *
 * These run the CLI as a user would: a real process, real files, real exit
 * codes. Nothing here reaches into the core — the point is the boundary.
 *
 * The invariant worth the most: stdout carries the document and nothing else,
 * so `msd-flex-bridge lift feed.zip > out.json` is a usable file, and a refused
 * feed leaves stdout empty rather than writing a partial document.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = 'src/cli.js';
const MIZUHO = 'test/fixtures/mizuho/Mizuho_Area-20260202.zip';
const EXPECTED = 'test/fixtures/expected';
const SYNTHETIC = 'test/fixtures/synthetic';

const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
const scratch = () => mkdtempSync(join(tmpdir(), 'msd-cli-'));

/* ------------------------------------------------------------- the zip path */

test('lifting the bundled archive: exit 0, document on stdout, messages on stderr', () => {
  const result = run('lift', MIZUHO);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, readFileSync(`${EXPECTED}/mizuho.msd.json`, 'utf8'));
  assert.match(result.stderr, /PASS/);
  assert.match(result.stderr, /MSD schema v0\.1\.0 \(release v0\.1\.1\)/);

  // stdout is exactly the document — nothing prepended, nothing appended.
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.msd_version, '0.1.0');
  assert.equal(result.stdout.endsWith('}\n'), true);
});

test('a directory is accepted as well as an archive', () => {
  const result = run('lift', `${SYNTHETIC}/valid-minimal`);

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.services[0].service_id, 'r1');
});

/* ----------------------------------------------------------------- outputs */

test('-o writes the document to a file and leaves stdout empty', () => {
  const dir = scratch();
  const out = join(dir, 'out.msd.json');
  const result = run('lift', MIZUHO, '-o', out);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(readFileSync(out, 'utf8'), readFileSync(`${EXPECTED}/mizuho.msd.json`, 'utf8'));
});

test('--residuals and --diagnostics write only when asked for', () => {
  const dir = scratch();
  const out = join(dir, 'out.msd.json');
  const residuals = join(dir, 'residuals.json');
  const diagnostics = join(dir, 'diagnostics.json');

  const bare = run('lift', MIZUHO, '-o', join(dir, 'bare.json'));
  assert.equal(bare.status, 0);
  assert.equal(existsSync(residuals), false, 'residuals are not written unless requested');

  const result = run('lift', MIZUHO, '-o', out, '--residuals', residuals, '--diagnostics', diagnostics);
  assert.equal(result.status, 0);
  assert.equal(readFileSync(residuals, 'utf8'), readFileSync(`${EXPECTED}/mizuho.residuals.json`, 'utf8'));
  assert.equal(readFileSync(diagnostics, 'utf8'), readFileSync(`${EXPECTED}/mizuho.diagnostics.json`, 'utf8'));
});

/* ---------------------------------------------------------------- refusals */

test('a geojson-zone feed exits 2 with a reason, and stdout stays empty', () => {
  const result = run('lift', `${SYNTHETIC}/geojson-zone`);

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '', 'a refused feed must not write a partial document');
  assert.match(result.stderr, /refused/);
  assert.match(result.stderr, /geojson_zone_kind/);
  assert.match(result.stderr, /locations\.geojson/);
  assert.match(result.stderr, /Nothing was written/);
});

test('an unsupported route type exits 2 and names the offending value', () => {
  const result = run('lift', `${SYNTHETIC}/unsupported-route-type`);

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /unsupported_route_type/);
  assert.match(result.stderr, /"route_type":"4"/);
  assert.match(result.stderr, /"route_id":"r1"/);
});

test('ordinary scheduled GTFS exits 2 as not flex', () => {
  const result = run('lift', `${SYNTHETIC}/plain-gtfs`);

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /not_flex/);
});

test('a refusal writes no output files even when they were requested', () => {
  const dir = scratch();
  const out = join(dir, 'out.msd.json');
  const result = run('lift', `${SYNTHETIC}/plain-gtfs`, '-o', out, '--residuals', join(dir, 'r.json'));

  assert.equal(result.status, 2);
  assert.equal(existsSync(out), false);
  assert.equal(existsSync(join(dir, 'r.json')), false);
});

/* ------------------------------------------------------------ read errors */

test('a missing input exits 3', () => {
  const result = run('lift', 'no-such-feed.zip');

  assert.equal(result.status, 3);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /cannot read/);
});

test('a file that is not an archive exits 3, not 2', () => {
  const dir = scratch();
  const junk = join(dir, 'junk.zip');
  writeFileSync(junk, Buffer.from([0, 1, 2, 3, 4]));

  const result = run('lift', junk);
  assert.equal(result.status, 3);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /not a readable zip archive/);
});

/* --------------------------------------------------------------- usage */

test('no command, an unknown command and an unknown option all exit 3', () => {
  for (const args of [[], ['validate'], ['lift', MIZUHO, '--wat'], ['lift']]) {
    const result = run(...args);
    assert.equal(result.status, 3, args.join(' '));
    assert.equal(result.stdout, '', 'usage errors never touch stdout');
    assert.match(result.stderr, /usage:/);
  }
});

test('--help exits 0 and prints usage on stdout', () => {
  const result = run('--help');

  assert.equal(result.status, 0);
  assert.match(result.stdout, /usage:/);
  assert.match(result.stdout, /exit codes:/);
  assert.equal(result.stderr, '');
});
