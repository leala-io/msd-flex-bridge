/**
 * roundtrip.test.js — negative tests for the diff, written before any result is read
 *
 * A comparison that reports "no differences" means nothing unless it can be
 * shown to detect differences. Every test below injects a known difference into
 * the generated side and asserts the diff **reports** it — except one, which
 * injects a difference that is not one and asserts the diff stays silent. A
 * diff that reports everything is as useless as one that reports nothing.
 *
 * These tests are the reason to believe the roundtrip result. They are the
 * evidence for the report, not decoration around it.
 *
 * The semantics they hold the implementation to are fixed in docs/roundtrip.md.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import { diffFeeds, valuesEqual } from '../src/core/roundtrip.js';
import { parseCsvText } from '../src/core/read.js';
import { serialise } from '../src/core/serialise.js';
import { liftFlexToMsd } from '../src/core/lift.js';
import { runRoundtrip } from '../scripts/roundtrip.mjs';

/* --------------------------------------------------------------- fixtures */

const STOPS = 'stop_id,stop_name,stop_lat,stop_lon,location_type\n1,殿ケ谷会館,35.76512,139.36366,0\n';

/** A minimal pair that compares clean, so each test changes exactly one thing. */
const base = () => ({
  original: { 'stops.txt': STOPS },
  generated: { 'stops.txt': STOPS },
});

/** All field-level differences the report carries, flattened. */
const differences = (report) =>
  Object.values(report.perFile).flatMap((f) => f.differences);

const findDifference = (report, column) =>
  differences(report).find((d) => d.column === column);

/* ------------------------------------------------------- the control case */

test('an unchanged pair reports nothing at all', () => {
  const { original, generated } = base();
  const report = diffFeeds(original, generated);

  assert.deepEqual(differences(report), []);
  assert.equal(report.totals.fieldDifferences, 0);
  assert.equal(report.totals.rowsOnlyOriginal, 0);
  assert.equal(report.totals.rowsOnlyGenerated, 0);
  assert.equal(report.perFile['stops.txt'].rows.matched, 1);
});

/* ------------------- decision 4: empty value versus absent column --------- */

test('an empty value against an absent column is reported — original has the column', () => {
  const original = { 'booking_rules.txt': 'booking_rule_id,booking_url\ngeneral,\n' };
  const generated = { 'booking_rules.txt': 'booking_rule_id\ngeneral\n' };

  const report = diffFeeds(original, generated);
  const d = findDifference(report, 'booking_url');

  assert.ok(d, 'an empty value on one side and no column on the other must be reported');
  assert.equal(d.kind, 'column_absent_in_generated');
  assert.equal(d.original, '', 'the empty string is preserved, not turned into null');
  assert.equal(d.generated, null, 'absent is null, and null is not the empty string');
});

test('an empty value against an absent column is reported — generated has the column', () => {
  const original = { 'booking_rules.txt': 'booking_rule_id\ngeneral\n' };
  const generated = { 'booking_rules.txt': 'booking_rule_id,booking_url\ngeneral,\n' };

  const report = diffFeeds(original, generated);
  const d = findDifference(report, 'booking_url');

  assert.ok(d, 'the reverse direction must be reported too');
  assert.equal(d.kind, 'column_absent_in_original');
  assert.equal(d.original, null);
  assert.equal(d.generated, '');
});

test('an empty value against a non-empty value is reported', () => {
  const original = { 'booking_rules.txt': 'booking_rule_id,booking_url\ngeneral,\n' };
  const generated = { 'booking_rules.txt': 'booking_rule_id,booking_url\ngeneral,https://example.org/\n' };

  const report = diffFeeds(original, generated);
  const d = findDifference(report, 'booking_url');

  assert.ok(d);
  assert.equal(d.kind, 'value_differs');
  assert.equal(d.original, '');
  assert.equal(d.generated, 'https://example.org/');
});

/* --------------- decision 3 and rule 4a: names are compared verbatim ------ */

test('a changed name is reported', () => {
  const { original, generated } = base();
  generated['stops.txt'] = STOPS.replace('殿ケ谷会館', '殿ケ谷公園');

  const d = findDifference(diffFeeds(original, generated), 'stop_name');

  assert.ok(d);
  assert.equal(d.original, '殿ケ谷会館');
  assert.equal(d.generated, '殿ケ谷公園');
});

test('a name differing only in a full-width character is reported', () => {
  const original = { 'stops.txt': 'stop_id,stop_name\n1,ＡＢＣ\n' };
  const generated = { 'stops.txt': 'stop_id,stop_name\n1,ABC\n' };

  const d = findDifference(diffFeeds(original, generated), 'stop_name');

  assert.ok(d, 'full-width and half-width Latin are different names, not a formatting variant');
  assert.equal(d.original, 'ＡＢＣ');
  assert.equal(d.generated, 'ABC');
});

test('a name differing only in an ideographic space is reported', () => {
  const original = { 'stops.txt': 'stop_id,stop_name\n1,殿ケ谷　会館\n' };
  const generated = { 'stops.txt': 'stop_id,stop_name\n1,殿ケ谷 会館\n' };

  const d = findDifference(diffFeeds(original, generated), 'stop_name');

  assert.ok(d, 'U+3000 against U+0020 is a different name — \\s collapsing would hide it');
  assert.equal(d.original.includes('　'), true);
  assert.equal(d.generated.includes('　'), false);
});

/* ------------------------------- decision 2: rows on one side only -------- */

test('a row present only in the original is reported', () => {
  const original = { 'stops.txt': `${STOPS}2,玉林寺公園,35.76802,139.36277,0\n` };
  const generated = { 'stops.txt': STOPS };

  const report = diffFeeds(original, generated);

  assert.equal(report.perFile['stops.txt'].rows.onlyOriginal.length, 1);
  assert.equal(report.perFile['stops.txt'].rows.onlyOriginal[0].key, '2');
  assert.equal(report.perFile['stops.txt'].rows.onlyGenerated.length, 0);
  assert.equal(report.totals.rowsOnlyOriginal, 1);
});

test('a row present only in the generated feed is reported', () => {
  const original = { 'stops.txt': STOPS };
  const generated = { 'stops.txt': `${STOPS}2,玉林寺公園,35.76802,139.36277,0\n` };

  const report = diffFeeds(original, generated);

  assert.equal(report.perFile['stops.txt'].rows.onlyGenerated.length, 1);
  assert.equal(report.perFile['stops.txt'].rows.onlyGenerated[0].key, '2');
  assert.equal(report.totals.rowsOnlyGenerated, 1);
});

/* ------------------------------ decision 6: files on one side only -------- */

test('a file present only in the original is reported, never skipped', () => {
  const original = { 'stops.txt': STOPS, 'translations.txt': 'table_name,field_name,language,translation,record_id,record_sub_id,field_value\nagency,agency_name,en,Mizuho Town,mizuhomachi,,\n' };
  const generated = { 'stops.txt': STOPS };

  const report = diffFeeds(original, generated);

  assert.deepEqual(report.files.onlyOriginal, [{ file: 'translations.txt', rows: 1 }]);
  assert.equal(report.totals.filesOnlyOriginal, 1);
  assert.equal(report.perFile['translations.txt'], undefined,
    'a file on one side only has no field-level comparison — it is not an empty file');
});

test('a file present only in the generated feed is reported', () => {
  const original = { 'stops.txt': STOPS };
  const generated = { 'stops.txt': STOPS, 'location_groups.txt': 'location_group_id,location_group_name\ng1,area\n' };

  const report = diffFeeds(original, generated);

  assert.deepEqual(report.files.onlyGenerated, [{ file: 'location_groups.txt', rows: 1 }]);
  assert.equal(report.totals.filesOnlyGenerated, 1);
});

/* ---- decision 5: the one that must NOT be reported ----------------------- */

test('a numerically equal but differently formatted coordinate is NOT reported', () => {
  const original = { 'stops.txt': 'stop_id,stop_lat,stop_lon\n1,35.76512,139.36366\n' };
  const generated = { 'stops.txt': 'stop_id,stop_lat,stop_lon\n1,35.765120,139.3636600\n' };

  const report = diffFeeds(original, generated);

  assert.deepEqual(differences(report), [],
    'a trailing zero is a formatting difference, not a value difference');
  assert.equal(report.perFile['stops.txt'].rows.matched, 1);
});

test('numeric tolerance does not leak into identifiers, dates or times', () => {
  // The same "trailing zero" reasoning applied to a date or an id would accept a
  // format this repository has no reason to accept. Decision 5 confines it.
  assert.equal(valuesEqual('stop_lat', '35.76512', '35.765120'), true);
  assert.equal(valuesEqual('stop_id', '1', '01'), false);
  assert.equal(valuesEqual('service_id', '1', '1.0'), false);
  assert.equal(valuesEqual('start_date', '20241001', '20241001.0'), false);
  assert.equal(valuesEqual('start_pickup_drop_off_window', '09:00:00', '9:00:00'), false);
  // Empty is not a number and is never coerced into one.
  assert.equal(valuesEqual('stop_lat', '', '0'), false);
  assert.equal(valuesEqual('pickup_type', '', '0'), false);
});

/* ---- decision 2's exception: stop_times is compared as a sequence -------- */

test('a reversed stop sequence is reported — order is semantic here', () => {
  const header = 'trip_id,stop_sequence,stop_id\n';
  const original = { 'stop_times.txt': `${header}t1,1,A\nt1,2,B\n` };
  const generated = { 'stop_times.txt': `${header}t1,1,B\nt1,2,A\n` };

  const report = diffFeeds(original, generated);
  const file = report.perFile['stop_times.txt'];

  assert.equal(file.comparedAs, 'sequence');
  assert.equal(file.differences.length, 2, 'both positions differ; a set comparison would call this a match');
  assert.deepEqual(file.differences.map((d) => [d.key, d.original, d.generated]), [
    ['t1#1', 'A', 'B'],
    ['t1#2', 'B', 'A'],
  ]);
});

test('rows are put in sequence order before comparing, not compared as written', () => {
  const header = 'trip_id,stop_sequence,stop_id\n';
  const original = { 'stop_times.txt': `${header}t1,1,A\nt1,2,B\n` };
  const generated = { 'stop_times.txt': `${header}t1,2,B\nt1,1,A\n` };

  const report = diffFeeds(original, generated);

  assert.deepEqual(report.perFile['stop_times.txt'].differences, [],
    'the same sequence written in another row order is the same sequence');
});

test('a trip with an extra stop time is reported as a row on one side only', () => {
  const header = 'trip_id,stop_sequence,stop_id\n';
  const original = { 'stop_times.txt': `${header}t1,1,A\nt1,2,B\n` };
  const generated = { 'stop_times.txt': `${header}t1,1,A\n` };

  const report = diffFeeds(original, generated);
  const file = report.perFile['stop_times.txt'];

  assert.equal(file.rows.matched, 1);
  assert.equal(file.rows.onlyOriginal.length, 1);
  assert.equal(file.rows.onlyOriginal[0].key, 't1#2');
});

/* ------------------------------------------------------ column order ------ */

test('a column reordering alone is not a difference', () => {
  const original = { 'stops.txt': 'stop_id,stop_name,stop_lat\n1,殿ケ谷会館,35.76512\n' };
  const generated = { 'stops.txt': 'stop_lat,stop_id,stop_name\n35.76512,1,殿ケ谷会館\n' };

  assert.deepEqual(differences(diffFeeds(original, generated)), [],
    'a header-bearing CSV identifies fields by name; order carries nothing');
});

/* ----------------------------------------------- refusal, not a guess ----- */

test('a file with no declared comparison semantics is refused, not guessed at', () => {
  const original = { 'shapes.txt': 'shape_id,shape_pt_lat\nS1,35.0\n' };
  const generated = { 'shapes.txt': 'shape_id,shape_pt_lat\nS1,35.0\n' };

  assert.throws(
    () => diffFeeds(original, generated),
    /no comparison semantics declared for shapes\.txt/,
    'choosing a key while comparing is choosing a normalisation with the result in view',
  );
});

/* ------------------------------------------------------------ determinism - */

test('the diff is deterministic — two runs produce an identical report', () => {
  const original = { 'stops.txt': `${STOPS}2,玉林寺公園,35.76802,139.36277,0\n` };
  const generated = { 'stops.txt': STOPS, 'location_groups.txt': 'location_group_id,location_group_name\ng1,area\n' };

  assert.deepEqual(diffFeeds(original, generated), diffFeeds(original, generated));
});

/* ================= the real roundtrip, on the bundled feed ================ */

/**
 * Everything above proves the diff can see. Everything below reads what it saw.
 * Two of these tests exist to stop a reader misreading a match: `location_type`
 * agrees because the exporter writes a constant, not because the value
 * survived, and saying so in an assertion is more durable than saying it in
 * prose.
 */

const FIXTURE = 'test/fixtures/mizuho/Mizuho_Area-20260202.zip';
const EXPECTED = 'test/fixtures/expected/mizuho.roundtrip.json';

const bytes = () => new Uint8Array(readFileSync(FIXTURE));

test('gate: the roundtrip reproduces the committed diff snapshot byte-for-byte', async () => {
  const { report } = await runRoundtrip(bytes());

  assert.equal(serialise(report), readFileSync(EXPECTED, 'utf8'));
});

test('gate: two consecutive roundtrips are byte-identical to each other', async () => {
  const first = await runRoundtrip(bytes());
  const second = await runRoundtrip(bytes());

  assert.equal(serialise(first.report), serialise(second.report));
  assert.deepEqual(first.generated, second.generated,
    'determinism holds across the whole chain, not only across the lift');
});

test('the empty booking URL survives the roundtrip as empty, not as absent', async () => {
  const { original, generated } = await runRoundtrip(bytes());

  const originalRule = parseCsvText(original['booking_rules.txt']).rows[0];
  const generatedRule = parseCsvText(generated['booking_rules.txt']).rows[0];

  assert.equal(originalRule.booking_url, '');
  assert.equal(generatedRule.booking_url, '');
  // The column is present on both sides. Empty and absent are different states,
  // and this is the case decision 4 of docs/roundtrip.md exists to protect.
  assert.ok(parseCsvText(original['booking_rules.txt']).header.includes('booking_url'));
  assert.ok(parseCsvText(generated['booking_rules.txt']).header.includes('booking_url'));
});

test('every stop survives the roundtrip byte-for-byte, names included', async () => {
  const { original, generated } = await runRoundtrip(bytes());

  assert.equal(generated['stops.txt'], original['stops.txt']);
  // The load-bearing names: nine carry U+3000, one carries full-width Latin.
  assert.ok(original['stops.txt'].includes('　'), 'the fixture still carries ideographic spaces');
});

test('the location_type match is a constant, not a value that survived', async () => {
  const { msd } = await liftFlexToMsd(bytes());
  const { generated } = await runRoundtrip(bytes());

  // The document carries no location_type anywhere: an MSD stop holds identity,
  // name and coordinates only. Residual entry `stop_metadata` records this.
  const stopKeys = new Set(msd.services.flatMap((s) => s.service_area.stops.flatMap(Object.keys)));
  assert.ok(!stopKeys.has('location_type'),
    'if this ever holds a location_type, the reasoning below is stale');

  // Yet the generated feed emits the column, because the exporter writes 0 for
  // every stop. It agrees with the original only because the original is all
  // zeros. Read as "the value round-tripped", this would be false comfort.
  const rows = parseCsvText(generated['stops.txt']).rows;
  assert.equal(rows.length, 120);
  assert.ok(rows.every((r) => r.location_type === '0'));
});
