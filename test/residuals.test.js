/**
 * residuals.test.js — the coverage dispositions (P1.4)
 *
 * One of the three dispositions is mechanically checkable from this repository
 * and one is not, and the difference is the whole reason this file exists.
 *
 * `field_exists` claims the vendored schema defines a field. That claim is
 * checked here against the schema itself, so it can never go stale again — an
 * earlier version of this report presented five fields the schema already
 * defines as candidates for a future version, and nothing caught it.
 *
 * `documented_candidate` names an entry in an upstream register that is not
 * vendored here. It cannot be verified from this repository; the closed set is
 * pinned below so that a new name cannot be introduced without a deliberate
 * edit, which is a different and weaker guarantee. See docs/mapping.md,
 * "Provenance of the coverage dispositions".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { liftFlexToMsd } from '../src/core/lift.js';

const MIZUHO = 'test/fixtures/mizuho/Mizuho_Area-20260202.zip';
const SCHEMA = 'vendor/msd/schema/v0.1.0/msd.schema.json';

/** Every property name the vendored schema defines, at any depth. */
function schemaProperties() {
  const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'));
  const names = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.properties) for (const key of Object.keys(node.properties)) names.add(key);
    for (const value of Object.values(node)) walk(value);
  };
  walk(schema);
  return names;
}

/** The upstream register, as supplied. Not verifiable from this repository. */
const DOCUMENTED_CANDIDATES = new Set([
  'eligibility',
  'membership_requirement',
  'booking-channel object shape',
  'service-level valid_from / valid_until',
  'rule-based recurring exceptions',
]);

const residualsOf = async () => (await liftFlexToMsd(new Uint8Array(readFileSync(MIZUHO)))).residuals;

test('every field_exists entry names a key the vendored schema actually defines', async () => {
  const residuals = await residualsOf();
  const defined = schemaProperties();

  const claims = residuals.filter((r) => r.model_coverage === 'field_exists');
  assert.ok(claims.length > 0, 'the report should claim at least one existing field');

  for (const claim of claims) {
    assert.ok(claim.field, `${claim.category} claims field_exists without naming a field`);
    assert.ok(
      defined.has(claim.field),
      `${claim.category} claims the schema defines "${claim.field}", and it does not`,
    );
  }

  // The five the correction turned on their head, pinned by name.
  const byCategory = Object.fromEntries(claims.map((c) => [c.category, c.field]));
  assert.equal(byCategory.fares, 'fare_structures');
  assert.equal(byCategory.payment_methods, 'payment_methods');
  assert.equal(byCategory.organisational_parties, 'legal_entity');
  assert.equal(byCategory.vehicles, 'vehicles');
  assert.equal(byCategory.web_booking_channel, 'booking_channels');
});

test('no candidate name is one the schema already defines', async () => {
  const residuals = await residualsOf();
  const defined = schemaProperties();

  for (const candidate of residuals.filter((r) => r.model_coverage === 'documented_candidate')) {
    assert.equal(
      defined.has(candidate.candidate),
      false,
      `${candidate.category} presents "${candidate.candidate}" as a future candidate, but the schema defines it`,
    );
  }
  // eligibility is the case that motivated the disposition: absent from the
  // schema, and tracked upstream.
  assert.equal(defined.has('eligibility'), false);
});

test('candidate names are drawn from the upstream register', async () => {
  const residuals = await residualsOf();

  for (const candidate of residuals.filter((r) => r.model_coverage === 'documented_candidate')) {
    assert.ok(
      DOCUMENTED_CANDIDATES.has(candidate.candidate),
      `"${candidate.candidate}" is not in the register; it is not a documented candidate`,
    );
  }
});

test('every entry carries exactly one disposition, and gaps say what they are', async () => {
  const residuals = await residualsOf();
  const allowed = ['field_exists', 'documented_candidate', 'undocumented_gap'];

  for (const item of residuals) {
    assert.ok(allowed.includes(item.model_coverage), `${item.category}: ${item.model_coverage}`);
    assert.ok(['a', 'b', 'c'].includes(item.class), `${item.category} has no class`);
    assert.ok(item.statement.trim().endsWith('.'), `${item.category} statement is not a sentence`);

    // The three dispositions are mutually exclusive in the data, not only in prose.
    const shape = [item.field !== undefined, item.candidate !== undefined].filter(Boolean).length;
    if (item.model_coverage === 'field_exists') assert.equal(item.field !== undefined, true);
    if (item.model_coverage === 'documented_candidate') assert.equal(item.candidate !== undefined, true);
    if (item.model_coverage === 'undocumented_gap') {
      assert.equal(shape, 0, `${item.category} is a gap but names a field or candidate`);
      assert.match(item.coverage_note, /not a defect, not a request and not a proposal/);
    }
  }
});

test('translated labels are a gap and are never promoted to a candidate', async () => {
  const residuals = await residualsOf();
  const translations = residuals.find((r) => r.category === 'translations');

  assert.equal(translations.model_coverage, 'undocumented_gap');
  assert.equal(translations.candidate, undefined);
  assert.match(translations.statement, /explicitly not a candidate/);
});

test('the six minimum categories are named, whatever their disposition', async () => {
  const residuals = await residualsOf();
  const categories = new Set(residuals.map((r) => r.category));

  for (const required of [
    'rider_eligibility', 'membership_requirement', 'per_channel_booking_metadata',
    'fares', 'payment_methods', 'organisational_parties', 'vehicles',
  ]) {
    assert.ok(categories.has(required), `${required} is missing from the report`);
  }
});
