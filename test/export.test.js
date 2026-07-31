/**
 * export.test.js — the timezone precondition (P2/B.3)
 *
 * Two tests carry this package. The first proves the abort is gone for the
 * reference case. The second proves it still fires for an unmapped country, and
 * that one matters more: it is the test that fails if someone later replaces the
 * explicit table with a lookup that falls back to a default. A default would
 * turn "we do not know this country" into a confident wrong timezone, and every
 * operating window in the generated feed would shift silently.
 *
 * The third test is the vendored closure's purity scan. Vendored paths are
 * excluded from the purity gate by design, so a wall-clock call inside the
 * exporter would be invisible here and would surface later as a determinism
 * failure on the roundtrip — looking like a bridge defect. No gate demands this
 * scan; it runs anyway, per file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { liftFlexToMsd } from '../src/core/lift.js';
import { createFlexExporter } from '../src/export.js';
import { BRIDGE_COUNTRY_TIMEZONES, extendCountryTimezone } from '../src/core/country-timezone.js';
import { analyse } from '../scripts/check-purity.mjs';
import { convert, buildFlexFeed } from '../vendor/msd-engine/engine.mjs';

const MIZUHO = 'test/fixtures/mizuho/Mizuho_Area-20260202.zip';

const exportFlexFeed = createFlexExporter({ convert, buildFlexFeed });

/** Parse one CSV file of the generated feed into row objects (header-keyed). */
function rows(csv) {
  const [head, ...body] = csv.trim().split('\n');
  const header = head.split(',');
  return body.map((line) => Object.fromEntries(header.map((h, i) => [h, line.split(',')[i]])));
}

/* ------------------------------------------------- the abort is gone (B.3a) */

test('the reference feed lifts and exports without aborting', async () => {
  const { msd } = await liftFlexToMsd(new Uint8Array(readFileSync(MIZUHO)));

  assert.equal(msd.provider.country, 'JP', 'the reference case is the unmapped country');

  const { files } = exportFlexFeed(msd);

  assert.ok(files['agency.txt'], 'a feed was produced');
  assert.equal(rows(files['agency.txt'])[0].agency_timezone, 'Asia/Tokyo');
});

/* --------------------------------------- the abort still fires (B.3b) ----- */

test('an unmapped country still aborts rather than guessing', async () => {
  const { msd } = await liftFlexToMsd(new Uint8Array(readFileSync(MIZUHO)));
  const unmapped = { ...msd, provider: { ...msd.provider, country: 'ZZ' } };

  assert.throws(
    () => exportFlexFeed(unmapped),
    /Cannot derive agency_timezone/,
    'an unknown country must abort, never fall back to a default',
  );
});

test('the extension resolves nothing it was not given', () => {
  const resolve = extendCountryTimezone(() => null);

  assert.equal(resolve('JP'), 'Asia/Tokyo');
  assert.equal(resolve('ZZ'), null);
  assert.equal(resolve(''), null);
  assert.equal(resolve(undefined), null);
  // A prototype key is not a country: the lookup must be own-property only.
  assert.equal(resolve('constructor'), null);
  assert.equal(resolve('toString'), null);
});

test('the extension adds to the exporter’s table and never overrides it', () => {
  const resolve = extendCountryTimezone((c) => (c === 'CH' ? 'Europe/Zurich' : null));

  assert.equal(resolve('CH'), 'Europe/Zurich', 'upstream’s answer wins where it has one');
  assert.equal(resolve('JP'), 'Asia/Tokyo', 'the bridge answers only where upstream does not');

  // Every addition must be one upstream does not already carry, or the bridge
  // would be shadowing a decision it does not own.
  for (const country of Object.keys(BRIDGE_COUNTRY_TIMEZONES)) {
    assert.equal(resolve(country), BRIDGE_COUNTRY_TIMEZONES[country]);
  }
});

/* -------------------------------- the vendored closure, scanned per file --- */

test('the vendored exporter closure is pure — no host import, no wall clock', () => {
  const closure = [
    'vendor/msd-engine/core/convert.js',
    'vendor/msd-engine/adapters/gtfs-flex/index.js',
  ];

  for (const file of closure) {
    const source = readFileSync(file, 'utf8');
    assert.deepEqual(analyse(source, file), [], `${file} must be free of host and clock access`);
  }
});

test('the vendored closure is closed — it requires nothing outside itself', () => {
  const required = {
    'vendor/msd-engine/core/convert.js': [],
    'vendor/msd-engine/adapters/gtfs-flex/index.js': ['../../core/convert'],
  };

  for (const [file, expected] of Object.entries(required)) {
    const source = readFileSync(file, 'utf8');
    const found = [...source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    assert.deepEqual(found, expected, `${file}: the closure grew a new dependency`);
  }
});

test('the vendored files are untouched by the injection', () => {
  // The route taken in B.2 replaces a property on the module object at run time.
  // If it ever became a file edit instead, the drift check would catch it — but
  // only if the hashes in docs/dependency.md were not edited to match. This
  // asserts the injection is what it claims to be: the source still carries
  // upstream's own two-country table.
  const source = readFileSync('vendor/msd-engine/core/convert.js', 'utf8');

  assert.match(source, /const COUNTRY_TZ = \{\n\s*CH: 'Europe\/Zurich',\n\s*UG: 'Africa\/Kampala',\n\};/);
  assert.ok(!source.includes('Asia/Tokyo'), 'the addition is bridge code, not a vendored edit');
});
