/**
 * lift.test.js — the lift, its snapshots, and the properties no gate catches
 *
 * The fixture and determinism gates live here alongside the fidelity tests,
 * because a snapshot alone cannot tell you *why* it is right: it would agree
 * with a mistake as readily as with a correct document.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { liftFlexToMsd, toClockTime, slugFromName } from '../src/core/lift.js';
import { serialise } from '../src/core/serialise.js';

const MIZUHO = 'test/fixtures/mizuho/Mizuho_Area-20260202.zip';
const EXPECTED = 'test/fixtures/expected';
const SYNTHETIC = 'test/fixtures/synthetic';

const zipBytes = () => new Uint8Array(readFileSync(MIZUHO));

function loadDir(dir) {
  const files = {};
  for (const name of readdirSync(join(SYNTHETIC, dir))) {
    if (name === 'README.md') continue;
    files[name] = new Uint8Array(readFileSync(join(SYNTHETIC, dir, name)));
  }
  return files;
}

/** Every string value anywhere in a structure. */
function allStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) allStrings(v, out);
  return out;
}

/** Every key name anywhere in a structure. */
function allKeys(value, out = []) {
  if (Array.isArray(value)) for (const v of value) allKeys(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.push(k); allKeys(v, out); }
  }
  return out;
}

/* ------------------------------------------------------------ fixture gate */

test('gate: the lift reproduces the committed snapshots byte-for-byte', async () => {
  const { msd, residuals, diagnostics } = await liftFlexToMsd(zipBytes());

  assert.equal(serialise(msd), readFileSync(`${EXPECTED}/mizuho.msd.json`, 'utf8'));
  assert.equal(serialise(residuals), readFileSync(`${EXPECTED}/mizuho.residuals.json`, 'utf8'));
  assert.equal(serialise(diagnostics), readFileSync(`${EXPECTED}/mizuho.diagnostics.json`, 'utf8'));
});

test('gate: two consecutive lifts are byte-identical to each other', async () => {
  const first = await liftFlexToMsd(zipBytes());
  const second = await liftFlexToMsd(zipBytes());

  assert.equal(serialise(second.msd), serialise(first.msd));
  assert.equal(serialise(second.residuals), serialise(first.residuals));
  assert.equal(serialise(second.diagnostics), serialise(first.diagnostics));
});

test('serialisation is canonical: two-space indent, trailing newline, raw non-ASCII', async () => {
  const { msd } = await liftFlexToMsd(zipBytes());
  const text = serialise(msd);

  assert.ok(text.endsWith('}\n'));
  assert.ok(text.includes('\n  "msd_version": "0.1.0",'));
  assert.equal(text.includes('\\u'), false, 'non-ASCII must be written raw');
  assert.ok(text.includes('瑞穂町'));
});

/* ---------------------------------------------------------- name fidelity */

test('the nine U+3000 names and the fullwidth-Latin name survive into the document', async () => {
  const { msd } = await liftFlexToMsd(zipBytes());
  const stops = msd.services[0].service_area.stops;

  const withIdeographicSpace = stops.filter((s) => s.name?.includes('　')).map((s) => s.stop_id);
  assert.deepEqual(withIdeographicSpace, ['33', '47', '48', '49', '65', '82', '85', '111', '119']);

  const s111 = stops.find((s) => s.stop_id === '111');
  assert.equal(s111.name, 'トヨタＳ＆Ｄ　Ｕ－Ｃａｒ横田ベースサイド店');
  assert.notEqual(s111.name, s111.name.normalize('NFKC'));
  assert.notEqual(s111.name, s111.name.replace(/\s+/g, ' '));

  // The service name is the route's long name, verbatim.
  assert.equal(msd.services[0].name, 'チョイソコみずほまち');
  assert.equal(msd.provider.name, '瑞穂町');
});

test('no translations.txt value appears anywhere in the document', async () => {
  const { msd, diagnostics } = await liftFlexToMsd(zipBytes());

  const translations = diagnostics.translations.map((t) => t.translation).filter(Boolean);
  assert.ok(translations.length >= 126);

  const documentStrings = new Set(allStrings(msd));
  for (const translation of translations) {
    assert.equal(documentStrings.has(translation), false, `translation leaked: ${translation}`);
  }
});

/* ------------------------------------------------------- omission fidelity */

test('absent facts are absent keys — not null, 0, false or []', async () => {
  const { msd } = await liftFlexToMsd(zipBytes());
  const keys = new Set(allKeys(msd));

  for (const forbidden of [
    'fare_structures', 'payment_methods', 'vehicles', 'accessibility',
    'eligibility', 'legal_entity', 'settlement', 'routing_hints', 'ttl',
    'booking_confirmation', 'passenger_identification', 'description',
  ]) {
    assert.equal(keys.has(forbidden), false, `${forbidden} must be absent, not empty`);
  }

  // Assert absence, not falsity: `in` would pass on a key set to null.
  assert.equal('fare_structures' in msd, false);
  assert.equal('vehicles' in msd.services[0], false);
  assert.equal('accessibility' in msd.services[0], false);

  // Nothing anywhere in the document is null.
  const nulls = JSON.stringify(msd).match(/:null/g) ?? [];
  assert.deepEqual(nulls, []);

  // An empty booking_url yields no web channel, and no empty array either.
  assert.deepEqual(msd.booking_rules.booking_channels, ['phone']);
});

/* --------------------------------------------------- diagnostics separation */

test('no diagnostics container, and no diagnostics content, reaches the document', async () => {
  const { msd, diagnostics } = await liftFlexToMsd(zipBytes());
  const documentKeys = new Set(allKeys(msd));

  assert.equal('diagnostics' in msd, false);
  assert.equal(documentKeys.has('diagnostics'), false);
  assert.equal(documentKeys.has('residuals'), false);

  // Every key in the document is a property the schema defines. This is the
  // load-bearing assertion: the schema leaves additionalProperties unset, so a
  // stray diagnostics blob would validate silently, and only an explicit check
  // catches it.
  //
  // Note this cannot be phrased as "no key name of the diagnostics object
  // appears in the document": docs/mapping.md fixes the merge record at
  // diagnostics.services[i].calendar_merge, so "services" is legitimately a key
  // on both sides. Shared names are not leakage; shared content would be.
  const schema = JSON.parse(readFileSync('vendor/msd/schema/v0.1.0/msd.schema.json', 'utf8'));
  const schemaProperties = new Set();
  const collect = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.properties) for (const key of Object.keys(node.properties)) schemaProperties.add(key);
    for (const value of Object.values(node)) collect(value);
  };
  collect(schema);

  for (const key of documentKeys) {
    assert.ok(schemaProperties.has(key), `"${key}" is not a property the schema defines`);
  }

  // And no diagnostics value is embedded anywhere in the document.
  const documentText = serialise(msd);
  for (const [name, value] of Object.entries(diagnostics)) {
    if (value === undefined || value === null) continue;
    const rendered = JSON.stringify(value);
    if (rendered.length < 40) continue; // too small to be a meaningful signature
    assert.equal(documentText.includes(rendered), false, `diagnostics.${name} is embedded in the document`);
  }
});

/* ------------------------------------------------------ weekday vocabulary */

test('emitted days are drawn from the seven documented tokens, in week order', async () => {
  const { msd } = await liftFlexToMsd(zipBytes());
  const allowed = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];

  const defaults = msd.services[0].operating_hours.default;
  assert.equal(defaults.length, 2);
  assert.deepEqual(defaults[0].days, ['tu', 'fr', 'sa']);
  assert.deepEqual(defaults[1].days, ['mo', 'we', 'sa']);

  for (const entry of defaults) {
    for (const day of entry.days) assert.ok(allowed.includes(day), `unknown token ${day}`);
    const positions = entry.days.map((d) => allowed.indexOf(d));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'days must be in week order');
  }
});

/* ------------------------------------------------------------- derivations */

test('last_updated comes from the cascade, with provenance, never a clock', async () => {
  const { msd, diagnostics } = await liftFlexToMsd(zipBytes());

  assert.equal(msd.last_updated, '2026-02-15T00:00:00Z');
  assert.deepEqual(diagnostics.provenance.last_updated, {
    level: 1,
    source_field: 'feed_info.feed_version',
    value: '20260215',
  });
});

test('the cascade falls through to level 2 and level 3, and refuses below them', async () => {
  const base = loadDir('valid-minimal');
  const decode = (name) => new TextDecoder().decode(base[name]);

  const level2 = { ...base };
  level2['feed_info.txt'] = decode('feed_info.txt').replace(',20260101\n', ',\n');
  const r2 = await liftFlexToMsd(level2);
  assert.equal(r2.msd.last_updated, '2026-01-01T00:00:00Z');
  assert.equal(r2.diagnostics.provenance.last_updated.level, 2);
  assert.ok(r2.residuals.some((e) => e.category === 'document_freshness' && e.class === 'c'));

  const level3 = { ...base };
  delete level3['feed_info.txt'];
  const r3 = await liftFlexToMsd(level3);
  assert.equal(r3.msd.last_updated, '2026-01-01T00:00:00Z');
  assert.equal(r3.diagnostics.provenance.last_updated.level, 3);
  assert.equal(r3.diagnostics.provenance.last_updated.source_field, 'calendar.start_date');

  const level4 = { ...base };
  delete level4['feed_info.txt'];
  level4['calendar.txt'] = decode('calendar.txt').replace('20260101,20261231', ',');
  const r4 = await liftFlexToMsd(level4);
  assert.equal(r4.msd, null);
  assert.equal(r4.refusal.code, 'no_document_freshness');
});

test('country is set only through the explicit zone table', async () => {
  const { msd, diagnostics } = await liftFlexToMsd(zipBytes());
  assert.equal(msd.provider.country, 'JP');
  assert.equal(diagnostics.provenance.country.rule, 'explicit zone→country table');

  const files = loadDir('valid-minimal');
  const decode = (name) => new TextDecoder().decode(files[name]);
  files['agency.txt'] = decode('agency.txt').replace('Europe/Zurich', 'Antarctica/Troll');
  const unmapped = await liftFlexToMsd(files);

  assert.equal('country' in unmapped.msd.provider, false);
  assert.equal(unmapped.diagnostics.provenance.timezone.value, 'Antarctica/Troll');
});

test('contact_email falls back to feed_info only when agency_email is absent', async () => {
  const { msd, diagnostics } = await liftFlexToMsd(zipBytes());
  assert.equal(msd.provider.contact_email, 'koutuu@town.mizuho.tokyo.jp');
  assert.equal(diagnostics.provenance.contact_email.source_field, 'feed_info.feed_contact_email');
});

test('provider_id falls back to a deterministic slug when agency_id is absent', async () => {
  const files = loadDir('valid-minimal');
  const decode = (name) => new TextDecoder().decode(files[name]);
  files['agency.txt'] = decode('agency.txt').replace('\ndemo,', '\n,');

  const first = await liftFlexToMsd(files);
  const second = await liftFlexToMsd(files);

  assert.match(first.msd.provider.provider_id, /^agency-[0-9a-f]{8}$/);
  assert.equal(first.msd.provider.provider_id, second.msd.provider.provider_id);
  assert.equal(first.diagnostics.provenance.provider_id.source_field, 'agency.agency_name');
  assert.equal(slugFromName('Demo Transit'), first.msd.provider.provider_id);
  assert.notEqual(slugFromName('Demo Transit'), slugFromName('Demo Transit 2'));
});

/* ------------------------------------------------------------ coordinates */

test('coordinates are numbers in range; unparsable ones omit the key and leave a residual', async () => {
  const { msd, diagnostics } = await liftFlexToMsd(zipBytes());
  const stops = msd.services[0].service_area.stops;
  assert.equal(stops.length, 120);
  for (const stop of stops) {
    assert.equal(typeof stop.coordinates.lat, 'number');
    assert.equal(typeof stop.coordinates.lon, 'number');
  }
  assert.deepEqual(diagnostics.coordinates, []);

  const files = loadDir('valid-minimal');
  const decode = (name) => new TextDecoder().decode(files[name]);
  files['stops.txt'] = decode('stops.txt')
    .replace('s1,Marktplatz,47.3769,8.5417', 's1,Marktplatz,not-a-number,8.5417')
    .replace('47.3782,8.5401', '147.3782,8.5401');

  const broken = await liftFlexToMsd(files);
  const brokenStops = broken.msd.services[0].service_area.stops;

  for (const stop of brokenStops) {
    assert.equal('coordinates' in stop, false);
    assert.ok(stop.stop_id);
    assert.ok(stop.name, 'the stop keeps its name');
  }
  assert.equal(broken.diagnostics.coordinates.length, 2);
  assert.equal(broken.residuals.filter((r) => r.category === 'stop_coordinates').length, 2);
});

test('a trailing-zero coordinate is written as a number, with the source string kept', async () => {
  const files = loadDir('valid-minimal');
  const decode = (name) => new TextDecoder().decode(files[name]);
  files['stops.txt'] = decode('stops.txt').replace('47.3769,8.5417', '47.3769000,8.5417');

  const { msd, diagnostics } = await liftFlexToMsd(files);
  const stop = msd.services[0].service_area.stops[0];

  assert.equal(stop.coordinates.lat, 47.3769);
  assert.equal(typeof stop.coordinates.lat, 'number');
  const note = diagnostics.coordinates.find((n) => n.stop_id === 's1');
  assert.equal(note.kind, 'reformatted');
  assert.equal(note.source_lat, '47.3769000');
});

/* ------------------------------------------------------- calendar handling */

test('two calendars on one route merge into one service, with the mandatory diagnostic', async () => {
  const { msd, diagnostics } = await liftFlexToMsd(zipBytes());

  assert.equal(msd.services.length, 1);
  const merge = diagnostics.services['mizuhomachi_route'].calendar_merge;
  assert.equal(merge.count, 2);
  assert.deepEqual(merge.merged, ['east_service', 'west_service']);
  assert.match(merge.statement, /the feed gives no reason for the separation/);
});

test('exception dates are reformatted and marked closed', async () => {
  const { msd } = await liftFlexToMsd(zipBytes());
  const exceptions = msd.services[0].operating_hours.exceptions;

  assert.equal(exceptions.length, 96);
  for (const exception of exceptions) {
    assert.match(exception.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(exception.closed, true);
  }
});

/* --------------------------------------------------------------- helpers */

test('toClockTime reduces extended hours and rejects what it cannot express', () => {
  assert.equal(toClockTime('09:00:00'), '09:00');
  assert.equal(toClockTime('24:00:00'), '00:00');
  assert.equal(toClockTime('25:30:00'), '01:30');
  assert.equal(toClockTime('9:05'), '09:05');
  assert.equal(toClockTime('not a time'), null);
  assert.equal(toClockTime(''), null);
  assert.equal(toClockTime(undefined), null);
});

/* ------------------------------------------------------------- refusals */

test('a refused feed returns a structured refusal and no document', async () => {
  const { msd, residuals, refusal } = await liftFlexToMsd(loadDir('geojson-zone'));

  assert.equal(msd, null);
  assert.deepEqual(residuals, []);
  assert.equal(refusal.code, 'geojson_zone_kind');
  assert.ok(refusal.evidence);
});
