/**
 * read.test.js — feed reader (P1.1)
 *
 * The tests live outside src/core/**, so they may touch the filesystem; the
 * reader itself never does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { readFeed, stripBom } from '../src/core/read.js';

const MIZUHO = 'test/fixtures/mizuho/Mizuho_Area-20260202.zip';
const SYNTHETIC = 'test/fixtures/synthetic';

/** Load a fixture directory as the { filename -> content } map the core takes. */
function loadDir(dir) {
  const files = {};
  for (const name of readdirSync(join(SYNTHETIC, dir))) {
    if (name === 'README.md') continue;
    files[name] = new Uint8Array(readFileSync(join(SYNTHETIC, dir, name)));
  }
  return files;
}

const zipBytes = () => new Uint8Array(readFileSync(MIZUHO));

/* --------------------------------------------------------------- zip path */

test('reads the bundled archive: twelve files, pinned row counts', async () => {
  const feed = await readFeed(zipBytes());

  assert.equal(feed.present.length, 12);
  assert.deepEqual(feed.present, [
    'agency.txt', 'booking_rules.txt', 'calendar.txt', 'calendar_dates.txt',
    'feed_info.txt', 'location_group_stops.txt', 'location_groups.txt',
    'routes.txt', 'stop_times.txt', 'stops.txt', 'translations.txt', 'trips.txt',
  ]);

  const counts = Object.fromEntries(Object.entries(feed.files).map(([k, v]) => [k, v.length]));
  assert.deepEqual(counts, {
    'agency.txt': 1, 'booking_rules.txt': 1, 'calendar.txt': 2, 'calendar_dates.txt': 96,
    'feed_info.txt': 1, 'location_group_stops.txt': 120, 'location_groups.txt': 1,
    'routes.txt': 1, 'stop_times.txt': 4, 'stops.txt': 120, 'translations.txt': 126,
    'trips.txt': 2,
  });
  assert.deepEqual(feed.diagnostics, []);
});

test('rows are keyed by the header, verbatim', async () => {
  const feed = await readFeed(zipBytes());
  assert.deepEqual(feed.headers['stops.txt'], ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'location_type']);
  assert.deepEqual(feed.files['agency.txt'][0], {
    agency_id: 'mizuhomachi',
    agency_name: '瑞穂町',
    agency_url: 'https://www.town.mizuho.tokyo.jp/',
    agency_timezone: 'Asia/Tokyo',
    agency_lang: 'ja',
    agency_phone: '050-2030-2630',
  });
});

/* ------------------------------------------------------- value preservation */

test('empty strings survive as empty strings, never null or undefined', async () => {
  const feed = await readFeed(zipBytes());

  const rule = feed.files['booking_rules.txt'][0];
  assert.equal(rule.booking_url, '');
  assert.ok('booking_url' in rule);
  assert.notEqual(rule.booking_url, null);
  assert.notEqual(rule.booking_url, undefined);

  // An empty booking_url is a fact about the feed (class (b)), not an absence.
  const st = feed.files['stop_times.txt'];
  assert.equal(st[0].drop_off_booking_rule_id, '');
  assert.equal(st[1].pickup_booking_rule_id, '');
});

test('every value is a string; nothing is coerced to a number', async () => {
  const feed = await readFeed(zipBytes());
  for (const rows of Object.values(feed.files)) {
    for (const row of rows) {
      for (const value of Object.values(row)) {
        assert.equal(typeof value, 'string');
      }
    }
  }
  assert.equal(feed.files['stops.txt'][0].stop_lat, String(feed.files['stops.txt'][0].stop_lat));
  assert.equal(feed.files['routes.txt'][0].route_type, '715');
});

/* ------------------------------------------------------------ name fidelity */

test('name fidelity: the nine U+3000 names and the fullwidth-Latin name survive byte-identically', async () => {
  const feed = await readFeed(zipBytes());
  const stops = feed.files['stops.txt'];

  const withIdeographicSpace = stops.filter((s) => s.stop_name.includes('　')).map((s) => s.stop_id);
  assert.deepEqual(withIdeographicSpace, ['33', '47', '48', '49', '65', '82', '85', '111', '119']);

  const s111 = stops.find((s) => s.stop_id === '111');
  assert.equal(s111.stop_name, 'トヨタＳ＆Ｄ　Ｕ－Ｃａｒ横田ベースサイド店');

  // The traps themselves: what a careless read would have done.
  assert.notEqual(s111.stop_name, s111.stop_name.normalize('NFKC'));
  assert.notEqual(s111.stop_name, s111.stop_name.replace(/\s+/g, ' '));

  // trim() is a no-op on this feed and must stay one.
  assert.ok(stops.every((s) => s.stop_name === s.stop_name.trim()));
});

test('no translations.txt value is substituted into any name', async () => {
  const feed = await readFeed(zipBytes());
  const translations = new Set(feed.files['translations.txt'].map((t) => t.translation));
  assert.equal(translations.size > 0, true);

  for (const stop of feed.files['stops.txt']) {
    assert.equal(translations.has(stop.stop_name), false);
  }
  for (const route of feed.files['routes.txt']) {
    assert.equal(translations.has(route.route_long_name), false);
    assert.equal(translations.has(route.route_short_name), false);
  }
  for (const trip of feed.files['trips.txt']) {
    assert.equal(translations.has(trip.trip_headsign), false);
  }
  assert.equal(translations.has(feed.files['agency.txt'][0].agency_name), false);
});

/* --------------------------------------------------------------- BOM twin */

test('stripBom removes only a leading BOM', () => {
  assert.equal(stripBom('﻿agency_id'), 'agency_id');
  assert.equal(stripBom('agency_id'), 'agency_id');
  assert.equal(stripBom('a﻿b'), 'a﻿b');
  assert.equal(stripBom(''), '');
});

test('the BOM fixture reads identically to its BOM-free twin, field by field', async () => {
  const bom = await readFeed(loadDir('bom'));
  const twin = await readFeed(loadDir('valid-minimal'));

  assert.deepEqual(bom.present, twin.present);
  assert.deepEqual(bom.headers, twin.headers);
  assert.deepEqual(bom.files, twin.files);
  assert.deepEqual(bom.diagnostics, twin.diagnostics);

  // Field by field, explicitly — deepEqual on the whole object could pass on a
  // shape that lost the first header key on both sides.
  for (const name of twin.present) {
    const a = bom.files[name];
    const b = twin.files[name];
    assert.equal(a.length, b.length, name);
    for (let i = 0; i < b.length; i++) {
      assert.deepEqual(Object.keys(a[i]), Object.keys(b[i]), `${name} row ${i} keys`);
      for (const key of Object.keys(b[i])) {
        assert.equal(a[i][key], b[i][key], `${name} row ${i} field ${key}`);
      }
    }
  }

  // The BOM must not have survived into the first header key of any file.
  for (const header of Object.values(bom.headers)) {
    assert.equal(header[0].startsWith('﻿'), false);
  }
  // Multibyte content is untouched by BOM handling.
  assert.equal(bom.files['stops.txt'][1].stop_name, '　Am　Bahnhof');
});

/* -------------------------------------------------------- input shapes */

test('accepts a plain map of strings as well as bytes', async () => {
  const fromBytes = await readFeed(loadDir('valid-minimal'));
  const asStrings = {};
  for (const name of readdirSync(join(SYNTHETIC, 'valid-minimal'))) {
    if (name === 'README.md') continue;
    asStrings[name] = readFileSync(join(SYNTHETIC, 'valid-minimal', name), 'utf8');
  }
  const fromStrings = await readFeed(asStrings);
  assert.deepEqual(fromStrings.files, fromBytes.files);
});

test('non-CSV entries are kept as text and never parsed as CSV', async () => {
  const feed = await readFeed(loadDir('geojson-zone'));
  assert.ok('locations.geojson' in feed.raw);
  assert.equal('locations.geojson' in feed.files, false);
  assert.equal(JSON.parse(feed.raw['locations.geojson']).type, 'FeatureCollection');
});

/* ---------------------------------------------------------- diagnostics */

test('missing required files are diagnostics, not exceptions', async () => {
  const feed = await readFeed({ 'stops.txt': 'stop_id,stop_name\ns1,A\n' });

  const missing = feed.diagnostics.filter((d) => d.code === 'missing_required_file').map((d) => d.file);
  assert.deepEqual(missing, [
    'agency.txt', 'routes.txt', 'stop_times.txt', 'trips.txt',
    'calendar.txt | calendar_dates.txt',
  ]);
  // It still read what was there.
  assert.equal(feed.files['stops.txt'].length, 1);
});

test('an unreadable archive is a diagnostic, not a throw', async () => {
  const feed = await readFeed(new Uint8Array([0x00, 0x01, 0x02, 0x03]));
  assert.equal(feed.present.length, 0);
  assert.equal(feed.diagnostics[0].code, 'unreadable_archive');
});

test('no input and unsupported input are reported, not thrown', async () => {
  assert.equal((await readFeed(null)).diagnostics[0].code, 'no_input');
  assert.equal((await readFeed('a string')).diagnostics[0].code, 'unsupported_input');
});
