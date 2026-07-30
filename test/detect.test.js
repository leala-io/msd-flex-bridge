/**
 * detect.test.js — kind detection and fence (P1.2)
 *
 * The fence is a first-class check: one test per edge, each asserting the
 * refusal code, the one-sentence reason, and the evidence that names the
 * offending file, field or value verbatim.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { readFeed } from '../src/core/read.js';
import { detectKind } from '../src/core/detect.js';

const MIZUHO = 'test/fixtures/mizuho/Mizuho_Area-20260202.zip';
const SYNTHETIC = 'test/fixtures/synthetic';

function loadDir(dir) {
  const files = {};
  for (const name of readdirSync(join(SYNTHETIC, dir))) {
    if (name === 'README.md') continue;
    files[name] = new Uint8Array(readFileSync(join(SYNTHETIC, dir, name)));
  }
  return files;
}

const classify = async (input) => detectKind(await readFeed(input));

/* ---------------------------------------------------------------- accepted */

test('the bundled feed is accepted as the location-group kind', async () => {
  const result = await classify(new Uint8Array(readFileSync(MIZUHO)));

  assert.equal(result.accepted, true);
  assert.equal(result.kind, 'location_group');
  assert.equal(result.reason, null);
  assert.deepEqual(result.routes, [{
    route_id: 'mizuhomachi_route',
    route_type: '715',
    location_group_id: 'mizuhomachi_group',
    trip_ids: ['east_trip', 'west_trip'],
    service_ids: ['east_service', 'west_service'],
    booking_rule_ids: ['general'],
  }]);
});

test('the minimal synthetic feed is accepted, and so is its BOM twin', async () => {
  const plain = await classify(loadDir('valid-minimal'));
  const bom = await classify(loadDir('bom'));

  assert.equal(plain.accepted, true);
  assert.deepEqual(bom, plain);
});

/* --------------------------------------------------- edge (a): geojson zones */

test('a locations.geojson feed is refused as the geojson-zone kind', async () => {
  const result = await classify(loadDir('geojson-zone'));

  assert.equal(result.accepted, false);
  assert.equal(result.reason.code, 'geojson_zone_kind');
  assert.match(result.reason.message, /locations\.geojson/);
  assert.equal(result.reason.evidence.file, 'locations.geojson');
  assert.equal(result.reason.evidence.present, true);
});

test('stop_times.location_id alone is enough to refuse, without locations.geojson', async () => {
  const files = loadDir('geojson-zone');
  delete files['locations.geojson'];
  const result = await classify(files);

  assert.equal(result.accepted, false);
  assert.equal(result.reason.code, 'geojson_zone_kind');
  assert.equal(result.reason.evidence.field, 'location_id');
  assert.deepEqual(result.reason.evidence.values, ['zone1']);
});

/* ------------------------------------------------------------- not flex */

test('ordinary scheduled GTFS is refused as not flex', async () => {
  const result = await classify(loadDir('plain-gtfs'));

  assert.equal(result.accepted, false);
  assert.equal(result.reason.code, 'not_flex');
  assert.deepEqual(result.reason.evidence.absent, ['location_groups.txt', 'location_group_stops.txt']);
});

/* ------------------------------------------- edge (b): unsupported route type */

test('an unsupported route_type is refused with the offending value named', async () => {
  const result = await classify(loadDir('unsupported-route-type'));

  assert.equal(result.accepted, false);
  assert.equal(result.reason.code, 'unsupported_route_type');
  assert.match(result.reason.message, /"4"/);
  assert.deepEqual(result.reason.evidence.offending, [{ route_id: 'r1', route_type: '4' }]);
  assert.deepEqual(result.reason.evidence.accepted, ['3', '715']);
});

test('a feed mixing a conforming route with a non-conforming one is refused whole', async () => {
  const files = loadDir('valid-minimal');
  const decode = (name) => new TextDecoder().decode(files[name]);
  files['routes.txt'] = decode('routes.txt') + 'r2,demo,D2,Demo Ferry,4\n';
  files['trips.txt'] = decode('trips.txt') + 'r2,weekdays,t2,Whole area\n';
  files['stop_times.txt'] = decode('stop_times.txt')
    + 't2,g1,1,09:00:00,17:00:00,2,1,br1,\n'
    + 't2,g1,2,09:00:00,17:00:00,1,2,,br1\n';

  const result = await classify(files);

  assert.equal(result.accepted, false);
  assert.equal(result.reason.code, 'unsupported_route_type');
  assert.deepEqual(result.reason.evidence.offending, [{ route_id: 'r2', route_type: '4' }]);
  // No partial acceptance: the conforming route is not carried through.
  assert.deepEqual(result.routes, []);
});

test('a route that reaches no location group refuses the whole feed as mixed kinds', async () => {
  const files = loadDir('valid-minimal');
  const decode = (name) => new TextDecoder().decode(files[name]);
  files['routes.txt'] = decode('routes.txt') + 'r2,demo,D2,Second Line,3\n';
  files['trips.txt'] = decode('trips.txt') + 'r2,weekdays,t2,Whole area\n';
  // t2 has no stop_times rows at all, so r2 reaches no group.

  const result = await classify(files);

  assert.equal(result.accepted, false);
  // Distinct from not_flex: this feed is flex in part, and the message must say
  // that it mixes kinds rather than that it is not flex at all.
  assert.equal(result.reason.code, 'mixed_route_kinds');
  assert.match(result.reason.message, /"r2"/);
  assert.match(result.reason.message, /mixes flex and non-flex routes/);
  assert.equal(result.reason.evidence.route_id, 'r2');
  assert.equal(result.reason.evidence.route_type, '3');
  assert.deepEqual(result.reason.evidence.trip_ids, ['t2']);
  assert.equal(result.reason.evidence.stop_times_rows, 0);
});

test('the booking-rule union reads both link fields, not either alone', async () => {
  // The bundled feed's shape: the rule sits on the pickup link of row 1 and the
  // drop-off link of row 2. Reading one field alone would see half of it.
  const feed = await readFeed(new Uint8Array(readFileSync(MIZUHO)));
  const rows = feed.files['stop_times.txt'];
  assert.equal(rows[0].pickup_booking_rule_id, 'general');
  assert.equal(rows[0].drop_off_booking_rule_id, '');
  assert.equal(rows[1].pickup_booking_rule_id, '');
  assert.equal(rows[1].drop_off_booking_rule_id, 'general');

  assert.deepEqual(detectKind(feed).routes[0].booking_rule_ids, ['general']);
});

test('the union does not make two routes on one rule look divergent', async () => {
  // The failure the union rule prevents: r1 carries the rule on its pickup link
  // and r2 on its drop-off link. Either field alone would see two different
  // sets and refuse a feed that should be accepted.
  const files = loadDir('valid-minimal');
  const decode = (name) => new TextDecoder().decode(files[name]);
  files['routes.txt'] = decode('routes.txt') + 'r2,demo,D2,Second Line,715\n';
  files['trips.txt'] = decode('trips.txt') + 'r2,weekdays,t2,Whole area\n';
  files['stop_times.txt'] = decode('stop_times.txt')
    + 't2,g1,1,09:00:00,17:00:00,2,1,,br1\n'
    + 't2,g1,2,09:00:00,17:00:00,1,2,br1,\n';

  const result = await classify(files);

  assert.equal(result.accepted, true);
  assert.deepEqual(result.routes.map((r) => r.booking_rule_ids), [['br1'], ['br1']]);
});

/* --------------------------------------------------------- multi-group route */

test('a route referencing several location groups is refused with both groups named', async () => {
  const files = loadDir('valid-minimal');
  const decode = (name) => new TextDecoder().decode(files[name]);
  files['location_groups.txt'] = decode('location_groups.txt') + 'g2,Second area\n';
  files['location_group_stops.txt'] = decode('location_group_stops.txt') + 'g2,s2\n';
  files['stop_times.txt'] = decode('stop_times.txt')
    .replace('t1,g1,2,', 't1,g2,2,');

  const result = await classify(files);

  assert.equal(result.accepted, false);
  assert.equal(result.reason.code, 'multi_group_route');
  assert.equal(result.reason.evidence.route_id, 'r1');
  assert.deepEqual(result.reason.evidence.location_group_ids, ['g1', 'g2']);
  assert.match(result.reason.message, /merging them would assert a service area the feed does not state/);
});

/* ---------------------------------------------------- divergent booking rules */

test('two routes with different booking rules are refused', async () => {
  const files = loadDir('valid-minimal');
  const decode = (name) => new TextDecoder().decode(files[name]);
  files['routes.txt'] = decode('routes.txt') + 'r2,demo,D2,Second Line,715\n';
  files['trips.txt'] = decode('trips.txt') + 'r2,weekdays,t2,Whole area\n';
  files['stop_times.txt'] = decode('stop_times.txt')
    + 't2,g1,1,09:00:00,17:00:00,2,1,br2,\n'
    + 't2,g1,2,09:00:00,17:00:00,1,2,,br2\n';
  files['booking_rules.txt'] = decode('booking_rules.txt')
    + 'br2,1,60,Different rule,+41000000001,https://example.org/other,\n';

  const result = await classify(files);

  assert.equal(result.accepted, false);
  assert.equal(result.reason.code, 'divergent_booking_rules');
  assert.deepEqual(result.reason.evidence.per_route.map((r) => r.route_id), ['r1', 'r2']);
  assert.deepEqual(result.reason.evidence.per_route[0].booking_rule_ids, ['br1']);
  assert.deepEqual(result.reason.evidence.per_route[1].booking_rule_ids, ['br2']);
});

test('two routes sharing one booking rule and one info_url are accepted', async () => {
  const files = loadDir('valid-minimal');
  const decode = (name) => new TextDecoder().decode(files[name]);
  files['routes.txt'] = decode('routes.txt') + 'r2,demo,D2,Second Line,715\n';
  files['trips.txt'] = decode('trips.txt') + 'r2,weekdays,t2,Whole area\n';
  files['stop_times.txt'] = decode('stop_times.txt')
    + 't2,g1,1,09:00:00,17:00:00,2,1,br1,\n'
    + 't2,g1,2,09:00:00,17:00:00,1,2,,br1\n';

  const result = await classify(files);

  assert.equal(result.accepted, true);
  assert.equal(result.routes.length, 2);
  assert.deepEqual(result.routes.map((r) => r.route_id), ['r1', 'r2']);
});

test('routes with different info_url on their booking rules are refused', async () => {
  const files = loadDir('valid-minimal');
  const decode = (name) => new TextDecoder().decode(files[name]);
  files['routes.txt'] = decode('routes.txt') + 'r2,demo,D2,Second Line,715\n';
  files['trips.txt'] = decode('trips.txt') + 'r2,weekdays,t2,Whole area\n';
  files['stop_times.txt'] = decode('stop_times.txt')
    + 't2,g1,1,09:00:00,17:00:00,2,1,br2,\n'
    + 't2,g1,2,09:00:00,17:00:00,1,2,,br2\n';
  // Same shape of rule, different info_url only.
  files['booking_rules.txt'] = decode('booking_rules.txt')
    + 'br2,1,30,Please book ahead,+41000000000,https://example.org/elsewhere,\n';

  const result = await classify(files);

  assert.equal(result.accepted, false);
  assert.equal(result.reason.code, 'divergent_booking_rules');
  assert.deepEqual(result.reason.evidence.per_route[0].info_urls, ['https://example.org/info']);
  assert.deepEqual(result.reason.evidence.per_route[1].info_urls, ['https://example.org/elsewhere']);
});

/* ------------------------------------------------------------ unrecognised */

test('empty and non-GTFS input is refused as unrecognised', async () => {
  const empty = await classify({});
  assert.equal(empty.reason.code, 'unrecognised');

  const notGtfs = await classify({ 'readme.txt': 'hello\n' });
  assert.equal(notGtfs.reason.code, 'unrecognised');
  assert.deepEqual(notGtfs.reason.evidence.absent, ['agency.txt', 'routes.txt']);

  const noRoutes = await classify({
    'agency.txt': 'agency_id,agency_name\nd,Demo\n',
    'routes.txt': 'route_id,agency_id,route_type\n',
  });
  assert.equal(noRoutes.reason.code, 'unrecognised');
  assert.equal(noRoutes.reason.evidence.rows, 0);
});

/* ------------------------------------------------------- refusal contract */

test('every refusal is a structured value with a reason and evidence', async () => {
  const cases = ['geojson-zone', 'plain-gtfs', 'unsupported-route-type'];
  for (const dir of cases) {
    const result = await classify(loadDir(dir));
    assert.equal(result.accepted, false, dir);
    assert.equal(result.kind, null, dir);
    assert.equal(typeof result.reason.code, 'string', dir);
    assert.equal(typeof result.reason.message, 'string', dir);
    assert.ok(result.reason.message.trim().endsWith('.'), `${dir}: reason is one sentence`);
    assert.equal(typeof result.reason.evidence, 'object', dir);
    assert.ok(Object.keys(result.reason.evidence).length > 0, dir);
  }
});
