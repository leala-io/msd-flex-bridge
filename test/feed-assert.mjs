#!/usr/bin/env node
/**
 * feed-assert.mjs — fixture integrity and inventory assertions
 *
 * Pins the structural expectations of a bundled GTFS-Flex fixture so that the
 * ingestion core is never tested against a feed that has silently changed. It
 * checks the archive hash, the file set, encoding and line endings, row counts,
 * the structural facts the lift relies on, and the name-fidelity traps that a
 * conversion is most likely to destroy.
 *
 * It is independent of the lift: if a future feed differs, this says WHERE,
 * before any mapping code runs.
 *
 * Usage:  node test/feed-assert.mjs <feed.zip | feed-dir>
 * Exit:   0 all assertions pass | 1 one or more failed | 3 input unreadable
 *
 * Fixture: Mizuho Area demand-responsive transport, published by Mizuho Town,
 * CC BY 4.0. See test/fixtures/mizuho/ATTRIBUTION.md.
 *
 * No dependencies. Shells out to `unzip` only when given a .zip.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

/* ------------------------------------------------------------------ pinned */

const PIN = {
  zip_sha256: 'ada29cbd7e513c4840009056bea1c031eb405d5450616b5d5c8201d98857d5bc',
  zip_name: 'Mizuho_Area-20260202.zip',
  file_count: 12,
  files: [
    'agency.txt', 'booking_rules.txt', 'calendar.txt', 'calendar_dates.txt',
    'feed_info.txt', 'location_group_stops.txt', 'location_groups.txt',
    'routes.txt', 'stop_times.txt', 'stops.txt', 'translations.txt', 'trips.txt',
  ],
  absent: ['locations.geojson', 'fare_attributes.txt', 'fare_rules.txt',
    'fare_products.txt', 'fare_leg_rules.txt', 'shapes.txt', 'frequencies.txt',
    'transfers.txt', 'levels.txt', 'pathways.txt', 'areas.txt'],
  rows: {
    'agency.txt': 1, 'booking_rules.txt': 1, 'calendar.txt': 2,
    'calendar_dates.txt': 96, 'feed_info.txt': 1, 'location_group_stops.txt': 120,
    'location_groups.txt': 1, 'routes.txt': 1, 'stop_times.txt': 4,
    'stops.txt': 120, 'translations.txt': 126, 'trips.txt': 2,
  },
  // name-fidelity traps: these MUST survive the lift byte-identically
  traps: {
    ideographic_space_stop_ids: ['33', '47', '48', '49', '65', '82', '85', '111', '119'],
    fullwidth_latin_stop_id: '111',
    fullwidth_latin_name: 'トヨタＳ＆Ｄ\u3000Ｕ－Ｃａｒ横田ベースサイド店',
  },
};

/* ------------------------------------------------------------------- utils */

const results = [];
const ok = (name, detail = '') => results.push({ pass: true, name, detail });
const fail = (name, detail = '') => results.push({ pass: false, name, detail });
const assert = (cond, name, detail = '') => (cond ? ok(name, detail) : fail(name, detail));

/** Minimal RFC4180 CSV reader — handles quotes; returns array of objects. */
function parseCsv(text) {
  const rows = [];
  let field = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return { header: [], records: [] };
  const header = rows[0];
  const records = rows.slice(1)
    .filter(r => !(r.length === 1 && r[0] === ''))
    .map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
  return { header, records };
}

/* -------------------------------------------------------------------- load */

const input = process.argv[2];
if (!input) { console.error('usage: node mizuho-fixture-assert.mjs <feed.zip | feed-dir>'); process.exit(3); }

let dir, zipBytes = null;
try {
  const st = statSync(input);
  if (st.isDirectory()) dir = input;
  else {
    zipBytes = readFileSync(input);
    dir = mkdtempSync(join(tmpdir(), 'flexfix-'));
    execFileSync('unzip', ['-o', '-q', input, '-d', dir]);
  }
} catch (e) { console.error(`cannot read input: ${e.message}`); process.exit(3); }

/* ------------------------------------------------------- A. identity + shape */

if (zipBytes) {
  const sha = createHash('sha256').update(zipBytes).digest('hex');
  assert(sha === PIN.zip_sha256, 'A1 zip sha256 matches the analysed artefact',
    sha === PIN.zip_sha256 ? sha.slice(0, 16) + '…' : `got ${sha}`);
  assert(basename(input) === PIN.zip_name, 'A2 zip filename unchanged', basename(input));
} else {
  ok('A1 zip sha256', 'skipped (directory input)');
  ok('A2 zip filename', 'skipped (directory input)');
}

const present = readdirSync(dir).filter(f => statSync(join(dir, f)).isFile()).sort();
assert(present.length === PIN.file_count, 'A3 file count is 12', `${present.length} files`);
assert(JSON.stringify(present) === JSON.stringify(PIN.files), 'A4 file set matches', present.join(' '));
const wrongly = PIN.absent.filter(f => present.includes(f));
assert(wrongly.length === 0, 'A5 no geojson / fare / shape files present',
  wrongly.length ? `unexpected: ${wrongly.join(' ')}` : 'confirms the location-group kind');

/* ------------------------------------------------- B. encoding + line endings */

const raw = {}, csv = {};
for (const f of present) {
  const b = readFileSync(join(dir, f));
  raw[f] = b;
  const hasBom = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
  const hasCrlf = b.includes(Buffer.from('\r\n'));
  let utf8 = true;
  try { new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { utf8 = false; }
  assert(utf8, `B1 ${f} is valid UTF-8`);
  assert(!hasBom, `B2 ${f} carries no BOM`, 'BOM handling must be tested on a synthetic fixture');
  assert(!hasCrlf, `B3 ${f} uses LF line endings`);
  assert(b[b.length - 1] === 0x0a, `B4 ${f} ends with a newline`);
  csv[f] = parseCsv(b.toString('utf8'));
}

/* -------------------------------------------------------- C. row inventories */

for (const [f, n] of Object.entries(PIN.rows)) {
  const got = csv[f]?.records.length ?? -1;
  assert(got === n, `C ${f} has ${n} data rows`, `got ${got}`);
}

/* --------------------------------------------------- D. structural semantics */

const agency = csv['agency.txt'].records[0];
assert(agency.agency_id === 'mizuhomachi', 'D1 agency_id present and stable', agency.agency_id);
assert(agency.agency_timezone === 'Asia/Tokyo', 'D2 agency_timezone set', agency.agency_timezone);
assert(agency.agency_lang === 'ja', 'D3 agency_lang set', agency.agency_lang);
assert(!!agency.agency_phone, 'D4 agency_phone present', agency.agency_phone);

const route = csv['routes.txt'].records[0];
assert(route.route_type === '715', 'D5 route_type is 715 (extended demand-response)', route.route_type);
assert(route.route_color === '008080', 'D6 route_color present — has no MSD counterpart', route.route_color);

const cal = csv['calendar.txt'].records;
assert(cal.length === 2 && cal.every(r => r.start_date === '20241001' && r.end_date === '20260930'),
  'D7 two calendars, shared validity 20241001–20260930');
const pat = c => [c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday, c.sunday].join('');
assert(pat(cal[0]) === '0100110' && pat(cal[1]) === '1010010',
  'D8 east = Tue/Fri/Sat, west = Mon/Wed/Sat', `${pat(cal[0])} / ${pat(cal[1])}`);

const cd = csv['calendar_dates.txt'].records;
assert(cd.every(r => r.exception_type === '2'), 'D9 all 96 exceptions are removals (type 2)');
const per = cd.reduce((a, r) => (a[r.service_id] = (a[r.service_id] || 0) + 1, a), {});
assert(per.east_service === 48 && per.west_service === 48, 'D10 exceptions split 48 / 48', JSON.stringify(per));

const lg = csv['location_groups.txt'].records;
const lgs = csv['location_group_stops.txt'].records;
assert(lg.length === 1, 'D11 exactly one location group', lg[0].location_group_id);
assert(new Set(lgs.map(r => r.location_group_id)).size === 1, 'D12 all stops in that one group');
assert(lgs.length === csv['stops.txt'].records.length, 'D13 group covers every stop (120 / 120)');

const stops = csv['stops.txt'].records;
assert(JSON.stringify(csv['stops.txt'].header) ===
  JSON.stringify(['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'location_type']),
  'D14 stops.txt carries only the five minimal columns',
  'no stop_code, no wheelchair_boarding — feed omission, class (b)');
assert(stops.every(s => s.stop_lat && s.stop_lon), 'D15 every stop has coordinates');

const st = csv['stop_times.txt'].records;
assert(st.length === 4, 'D16 four stop_times rows');
assert(st.every(r => r.start_pickup_drop_off_window === '09:00:00' && r.end_pickup_drop_off_window === '17:00:00'),
  'D17 uniform 09:00–17:00 window on every row');
const pairs = st.map(r => `${r.pickup_type}/${r.drop_off_type}`);
assert(JSON.stringify(pairs) === JSON.stringify(['2/1', '1/2', '2/1', '1/2']),
  'D18 pickup/drop_off pattern 2/1 then 1/2 per trip',
  'two rows per trip: pickup seq 1, drop-off seq 2 — the flex >=2 rule');
assert(st.filter(r => r.pickup_booking_rule_id === 'general').length === 2 &&
  st.filter(r => r.drop_off_booking_rule_id === 'general').length === 2,
  'D19 booking rule referenced from both directions');

const br = csv['booking_rules.txt'].records[0];
assert(br.booking_type === '1', 'D20 booking_type 1 (same-day, prior notice)', br.booking_type);
assert(br.prior_notice_duration_min === '30', 'D21 prior_notice_duration_min = 30 minutes', br.prior_notice_duration_min);
assert(br.booking_url === '', 'D22 booking_url is EMPTY despite an existing portal',
  'class (b) feed omission — the published portal is not in the feed');
assert(br.message.length > 0, 'D23 free-text message present — carry verbatim, never parse',
  `${[...br.message].length} chars`);
assert(!('prior_notice_start_day' in br) && !('prior_notice_last_day' in br),
  'D24 no maximum booking horizon in the feed', 'ground truth says 2 weeks — class (c)');

const fi = csv['feed_info.txt'].records[0];
assert(fi.feed_version === '20260215', 'D25 feed_version pinned', fi.feed_version);
assert(!!fi.feed_contact_email, 'D26 feed_contact_email present', fi.feed_contact_email);

/* ------------------------------------------------------- E. translations rule */

const tr = csv['translations.txt'].records;
assert(new Set(tr.map(r => r.language)).size === 1 && tr[0].language === 'en',
  'E1 translations are English only');
const byTable = tr.reduce((a, r) => (a[r.table_name] = (a[r.table_name] || 0) + 1, a), {});
assert(byTable.stops === 120 && byTable.routes === 3 && byTable.trips === 2 && byTable.agency === 1,
  'E2 translation coverage stops120 / routes3 / trips2 / agency1', JSON.stringify(byTable));
const t119 = tr.find(r => r.table_name === 'stops' && r.record_id === '119');
assert(/^[A-Za-z]+$/.test(t119.translation),
  'E3 translations are romanisations, not English names', t119.translation);

/* ---------------------------------------------------- F. name-fidelity traps */

const IDEO = '\u3000';
const withIdeo = stops.filter(s => s.stop_name.includes(IDEO)).map(s => s.stop_id);
assert(JSON.stringify(withIdeo) === JSON.stringify(PIN.traps.ideographic_space_stop_ids),
  'F1 nine stop names contain U+3000 IDEOGRAPHIC SPACE',
  'any /\\s+/ collapse destroys them — forbidden');
const s111 = stops.find(s => s.stop_id === PIN.traps.fullwidth_latin_stop_id);
assert(s111.stop_name === PIN.traps.fullwidth_latin_name,
  'F2 stop 111 carries fullwidth Latin characters',
  'any .normalize("NFKC") rewrites this — forbidden');
assert(stops.every(s => s.stop_name === s.stop_name.trim()),
  'F3 no stop name has leading/trailing whitespace',
  'trim() is therefore a no-op here and must stay one');

/* ------------------------------------------------------------------ report */

const failed = results.filter(r => !r.pass);
const width = Math.max(...results.map(r => r.name.length));
console.log(`\nMizuho fixture assertions — ${results.length} checks\n${'─'.repeat(width + 12)}`);
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
console.log(`${'─'.repeat(width + 12)}\n${results.length - failed.length} passed, ${failed.length} failed\n`);
process.exit(failed.length ? 1 : 0);
