/**
 * validate.test.js — validation through the vendored path (P1.5)
 *
 * The validator is injected here exactly as the CLI will inject it: the schema
 * and the 14 registry code lists are read from vendor/msd/ by the test (which
 * may touch the filesystem) and handed to the core (which may not).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { liftFlexToMsd } from '../src/core/lift.js';
import { validateDocument } from '../src/core/validate.js';
import { validateMsd, formatErrors } from '../vendor/msd/core.mjs';

const MIZUHO = 'test/fixtures/mizuho/Mizuho_Area-20260202.zip';
const SCHEMA = 'vendor/msd/schema/v0.1.0/msd.schema.json';
const REGISTRY = 'vendor/msd/registry/v0.1.0';

const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'));
const registry = readdirSync(REGISTRY)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(`${REGISTRY}/${f}`, 'utf8')));

const injected = { validateMsd, formatErrors, schema, registry };

test('all fourteen registry code lists are registered by $id', () => {
  assert.equal(registry.length, 14);
  for (const entry of registry) {
    assert.match(entry.$id, /^https:\/\/leala-io\.github\.io\/msd\/registry\/v0\.1\.0\/[a-z_]+\.json$/);
  }
});

test('the lifted document passes validation', async () => {
  const { msd } = await liftFlexToMsd(new Uint8Array(readFileSync(MIZUHO)));
  const result = validateDocument(msd, injected);

  assert.deepEqual(result.messages, []);
  assert.equal(result.valid, true);
});

test('the failure path surfaces the validator’s own messages, unmodified', () => {
  const broken = {
    msd_version: '0.1.0',
    last_updated: 'the fifteenth of February',
    provider: { name: 'No id here' },
    services: [],
  };

  const result = validateDocument(broken, injected);
  assert.equal(result.valid, false);
  assert.ok(result.messages.length > 0);

  // The messages are AJV's, in the vendored formatter's shape.
  assert.deepEqual(result.messages, formatErrors(result.errors));
  assert.ok(result.messages.some((m) => m.includes('/last_updated') && m.includes('format')));
  assert.ok(result.messages.some((m) => m.includes('/provider') && m.includes('provider_id')));
  assert.ok(result.messages.some((m) => m.includes('/services') && m.includes('fewer than 1')));
});

test('a value outside a registry code list fails against the registered $id', async () => {
  const { msd } = await liftFlexToMsd(new Uint8Array(readFileSync(MIZUHO)));
  const tampered = structuredClone(msd);
  tampered.services[0].mode = 'tram';

  const result = validateDocument(tampered, injected);
  assert.equal(result.valid, false);
  assert.ok(result.messages.some((m) => m.includes('/services/0/mode')));
});

test('validation is refused without an injected validator, never silently skipped', () => {
  assert.throws(() => validateDocument({}, {}), /requires an injected validateMsd/);
  assert.throws(() => validateDocument({}, { validateMsd }), /requires the injected schema and registry/);
});
