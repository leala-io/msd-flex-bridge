/**
 * lift.js — GTFS-Flex → MSD (P1.3)
 *
 * Pure: no fs, path, process, os, url, child_process; no wall clock, no
 * randomness. Implements docs/mapping.md row by row. That document is the
 * specification; where it is silent this file does not decide.
 *
 * Three rules are restated here because each has a gate behind it:
 *
 *   Names verbatim — no .normalize(), no /\s+/ collapsing, no case folding, no
 *   transliteration, no substitution from translations.txt. Values reach the
 *   document exactly as the reader produced them.
 *
 *   Omission over invention (C1) — where the feed carries nothing, the key is
 *   absent. Never null, never 0, never false, never []. Every omission produces
 *   a residual entry instead.
 *
 *   Determinism — last_updated comes from the documented cascade, never from a
 *   clock. Key order is fixed by construction: every object below is built in a
 *   literal order matching the schema's own property order, so serialisation
 *   never needs to sort.
 *
 * Diagnostics and residuals are siblings of the returned document, never keys
 * inside it (docs/mapping.md, "Where the diagnostics and residuals live").
 */

import { readFeed } from './read.js';
import { detectKind } from './detect.js';
import { buildResiduals } from './residuals.js';

/** Emitted msd_version: the schema version, not the release that publishes it. */
const MSD_VERSION = '0.1.0';

/** Day tokens, Monday first (docs/mapping.md, day-token note). */
const DAY_TOKENS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
const DAY_COLUMNS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/**
 * IANA zone → ISO 3166-1 alpha-2, for zones whose country attribution is
 * unambiguous. Every entry is listed in docs/mapping.md. A zone not in this
 * table yields no provider.country — not guessed, not derived from a prefix,
 * not inferred from agency_lang.
 */
const ZONE_TO_COUNTRY = {
  'Asia/Tokyo': 'JP',
  'Europe/Zurich': 'CH',
  'Africa/Kampala': 'UG',
};

/** Schema ranges for coordinates (msd.schema.json $defs.stop). */
const LAT_RANGE = [-90, 90];
const LON_RANGE = [-180, 180];

const isNonEmpty = (value) => typeof value === 'string' && value !== '';

/** YYYYMMDD → YYYY-MM-DD, or null when it is not eight digits. */
function toIsoDate(value) {
  if (!/^\d{8}$/.test(value ?? '')) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/** YYYYMMDD → RFC 3339 instant at midnight UTC. */
function toIsoInstant(value) {
  const date = toIsoDate(value);
  return date === null ? null : `${date}T00:00:00Z`;
}

/**
 * GTFS HH:MM:SS → MSD HH:MM. Extended hours are reduced modulo 24 (24:00:00 →
 * 00:00, 25:30:00 → 01:30) — the inverse of the forward direction. Returns null
 * where the value cannot be expressed as HH:MM at all, which is a residual and
 * never a silent truncation.
 */
export function toClockTime(value) {
  const match = /^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/.exec(value ?? '');
  if (!match) return null;
  const hours = Number(match[1]) % 24;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/**
 * Deterministic slug of a UTF-8 string, used only when agency_id is absent.
 * A lowercased ASCII slug is not safe here — names are non-Latin — so this is a
 * byte-derived token: FNV-1a over the UTF-8 bytes, hex, fixed width. Pure, and
 * stable across runs and platforms (docs/mapping.md, provider_id rule).
 */
export function slugFromName(name) {
  const bytes = new TextEncoder().encode(name ?? '');
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `agency-${hash.toString(16).padStart(8, '0')}`;
}

/**
 * Lift a GTFS-Flex feed into an MSD document.
 *
 * @param {Uint8Array|ArrayBuffer|Object} files  zip bytes, or { filename -> content }.
 * @returns {Promise<{msd: object|null, residuals: object[], diagnostics: object,
 *                    refusal: null|{code: string, message: string, evidence: object}}>}
 *
 * A refused feed returns msd: null with the fence's structured refusal — the
 * same contract detection uses: refusals are values, not exceptions.
 */
export async function liftFlexToMsd(files) {
  const feed = await readFeed(files);
  const classification = detectKind(feed);

  const diagnostics = {
    read: feed.diagnostics,
    classification: { accepted: classification.accepted, kind: classification.kind },
  };

  if (!classification.accepted) {
    return { msd: null, residuals: [], diagnostics, refusal: classification.reason };
  }

  const rows = (name) => feed.files[name] ?? [];
  const first = (name) => rows(name)[0] ?? {};

  const agency = first('agency.txt');
  const feedInfo = first('feed_info.txt');

  /* ------------------------------------------------------------ provenance */

  const provenance = {};
  const lastUpdated = resolveLastUpdated(feedInfo, rows('calendar.txt'), provenance);
  if (lastUpdated === null) {
    return {
      msd: null,
      residuals: [],
      diagnostics,
      refusal: {
        code: 'no_document_freshness',
        message: 'The feed states no date from which last_updated can be derived: feed_version does not parse as YYYYMMDD, feed_start_date is absent, and no calendar carries a start_date.',
        evidence: {
          feed_version: feedInfo.feed_version ?? null,
          feed_start_date: feedInfo.feed_start_date ?? null,
          calendars: rows('calendar.txt').length,
        },
      },
    };
  }

  /* -------------------------------------------------------------- provider */

  const provider = buildProvider(agency, feedInfo, provenance);

  /* -------------------------------------------------------------- services */

  const stopsById = new Map(rows('stops.txt').map((s) => [s.stop_id, s]));
  const groupMembers = new Map();
  for (const row of rows('location_group_stops.txt')) {
    const list = groupMembers.get(row.location_group_id) ?? [];
    list.push(row.stop_id);
    groupMembers.set(row.location_group_id, list);
  }

  const coordinateNotes = [];
  const calendarMerge = {};
  const services = classification.routes.map((link) => {
    const route = rows('routes.txt').find((r) => r.route_id === link.route_id) ?? {};
    return buildService({
      route,
      link,
      calendars: rows('calendar.txt'),
      calendarDates: rows('calendar_dates.txt'),
      stopTimes: rows('stop_times.txt'),
      trips: rows('trips.txt'),
      stopsById,
      groupMembers,
      coordinateNotes,
      calendarMerge,
    });
  });

  /* --------------------------------------------------------- booking rules */

  const bookingRuleIds = [...new Set(classification.routes.flatMap((r) => r.booking_rule_ids))];
  const bookingRuleRows = rows('booking_rules.txt').filter((b) => bookingRuleIds.includes(b.booking_rule_id));
  const bookingRules = buildBookingRules(bookingRuleRows);
  const references = buildReferences(bookingRuleRows, feedInfo);

  /* ------------------------------------------------------------- document */
  // Key order follows the schema's own property order, by construction.

  const msd = {};
  msd.msd_version = MSD_VERSION;
  msd.last_updated = lastUpdated;
  msd.provider = provider;
  msd.services = services;
  if (bookingRules !== null) msd.booking_rules = bookingRules;
  if (references !== null) msd.references = references;

  /* ---------------------------------------------------------- diagnostics */

  diagnostics.provenance = provenance;
  diagnostics.source = {
    agency: agency,
    feed_info: feedInfo,
    routes: rows('routes.txt'),
    trips: rows('trips.txt'),
    location_groups: rows('location_groups.txt'),
    booking_rules: rows('booking_rules.txt'),
    stop_times: rows('stop_times.txt'),
  };
  diagnostics.services = calendarMerge;
  diagnostics.coordinates = coordinateNotes;
  diagnostics.translations = rows('translations.txt');
  diagnostics.stops_extra = collectStopExtras(rows('stops.txt'), feed.headers['stops.txt'] ?? []);

  const residuals = buildResiduals({ msd, feed, classification, provenance, coordinateNotes });

  return { msd, residuals, diagnostics, refusal: null };
}

/* ------------------------------------------------------------------ pieces */

/**
 * last_updated cascade, first match wins — never the system clock. Levels 2 and
 * 3 record provenance; the caller emits the matching residual.
 */
function resolveLastUpdated(feedInfo, calendars, provenance) {
  const fromVersion = toIsoInstant(feedInfo.feed_version);
  if (fromVersion !== null) {
    provenance.last_updated = { level: 1, source_field: 'feed_info.feed_version', value: feedInfo.feed_version };
    return fromVersion;
  }

  const fromStart = toIsoInstant(feedInfo.feed_start_date);
  if (fromStart !== null) {
    provenance.last_updated = { level: 2, source_field: 'feed_info.feed_start_date', value: feedInfo.feed_start_date };
    return fromStart;
  }

  const starts = calendars.map((c) => c.start_date).filter((d) => toIsoDate(d) !== null).sort();
  if (starts.length > 0) {
    provenance.last_updated = { level: 3, source_field: 'calendar.start_date', value: starts[0] };
    return toIsoInstant(starts[0]);
  }

  return null;
}

function buildProvider(agency, feedInfo, provenance) {
  const provider = {};

  provider.provider_id = isNonEmpty(agency.agency_id)
    ? agency.agency_id
    : slugFromName(agency.agency_name);
  if (!isNonEmpty(agency.agency_id)) {
    provenance.provider_id = {
      source_field: 'agency.agency_name',
      value: agency.agency_name ?? '',
      rule: 'deterministic slug of agency_name (FNV-1a over UTF-8 bytes)',
    };
  }

  provider.name = agency.agency_name ?? '';
  if (isNonEmpty(agency.agency_url)) provider.url = agency.agency_url;

  // Contact precedence: agency.txt over feed_info.txt (docs/mapping.md choice 19).
  const email = isNonEmpty(agency.agency_email) ? agency.agency_email : feedInfo.feed_contact_email;
  if (isNonEmpty(email)) {
    provider.contact_email = email;
    if (!isNonEmpty(agency.agency_email)) {
      provenance.contact_email = {
        source_field: 'feed_info.feed_contact_email',
        value: email,
        rule: 'fallback: agency_email absent',
      };
    }
  }

  // Timezone → country through the explicit table only; anything else omits.
  const zone = agency.agency_timezone ?? '';
  const country = Object.prototype.hasOwnProperty.call(ZONE_TO_COUNTRY, zone) ? ZONE_TO_COUNTRY[zone] : null;
  if (country !== null) {
    provider.country = country;
    provenance.country = {
      source_field: 'agency_timezone',
      value: zone,
      rule: 'explicit zone→country table',
    };
  }
  provenance.timezone = { source_field: 'agency.agency_timezone', value: zone };

  if (isNonEmpty(agency.agency_lang)) provider.languages = [agency.agency_lang];

  return provider;
}

function buildService(ctx) {
  const {
    route, link, calendars, calendarDates, stopTimes, trips,
    stopsById, groupMembers, coordinateNotes, calendarMerge,
  } = ctx;

  const service = {};
  service.service_id = route.route_id ?? link.route_id;
  service.service_type = 'on_demand';
  service.name = isNonEmpty(route.route_long_name) ? route.route_long_name : (route.route_short_name ?? '');
  service.mode = 'bus';

  const operatingHours = buildOperatingHours({
    link, calendars, calendarDates, stopTimes, trips, calendarMerge, serviceId: service.service_id,
  });
  if (operatingHours !== null) service.operating_hours = operatingHours;

  service.service_area = buildServiceArea({
    link, stopsById, groupMembers, coordinateNotes, serviceId: service.service_id,
  });

  return service;
}

/**
 * One operating_hours.default[] entry per calendar reaching this service, its
 * day array paired with the window of the trips running on that calendar. The
 * merge is per service and never crosses routes.
 */
function buildOperatingHours(ctx) {
  const { link, calendars, calendarDates, stopTimes, trips, calendarMerge, serviceId } = ctx;

  const serviceIds = link.service_ids;
  const reaching = calendars.filter((c) => serviceIds.includes(c.service_id));

  const defaults = [];
  for (const calendar of reaching) {
    const days = DAY_COLUMNS
      .map((column, index) => (calendar[column] === '1' ? DAY_TOKENS[index] : null))
      .filter((token) => token !== null);

    const tripIds = trips
      .filter((t) => t.route_id === link.route_id && t.service_id === calendar.service_id)
      .map((t) => t.trip_id);
    const windows = stopTimes.filter((s) => tripIds.includes(s.trip_id));

    const start = toClockTime(windows.find((w) => isNonEmpty(w.start_pickup_drop_off_window))?.start_pickup_drop_off_window);
    const end = toClockTime(windows.find((w) => isNonEmpty(w.end_pickup_drop_off_window))?.end_pickup_drop_off_window);

    // days/start/end are all required on a default[] entry; an entry that cannot
    // carry all three is not written at all (C1).
    if (days.length === 0 || start === null || end === null) continue;

    const entry = {};
    entry.days = days;
    entry.start = start;
    entry.end = end;
    defaults.push(entry);
  }

  if (reaching.length > 1) {
    calendarMerge[serviceId] = {
      calendar_merge: {
        merged: reaching.map((c) => c.service_id),
        count: reaching.length,
        statement: 'Several calendars were merged into one service; the feed gives no reason for the separation.',
      },
    };
  }

  // One exception entry per calendar_dates row reaching this service.
  const exceptions = [];
  for (const row of calendarDates) {
    if (!serviceIds.includes(row.service_id)) continue;
    const date = toIsoDate(row.date);
    if (date === null) continue;

    const entry = {};
    entry.date = date;
    if (row.exception_type === '2') entry.closed = true;
    else if (row.exception_type === '1') entry.closed = false;
    exceptions.push(entry);
  }

  if (defaults.length === 0 && exceptions.length === 0) return null;

  const operatingHours = {};
  if (defaults.length > 0) operatingHours.default = defaults;
  if (exceptions.length > 0) operatingHours.exceptions = exceptions;
  return operatingHours;
}

function buildServiceArea(ctx) {
  const { link, stopsById, groupMembers, coordinateNotes, serviceId } = ctx;

  const serviceArea = {};
  serviceArea.type = 'stops';
  serviceArea.stops = (groupMembers.get(link.location_group_id) ?? []).map((stopId) => {
    const source = stopsById.get(stopId);
    const stop = {};
    stop.stop_id = stopId;
    if (source === undefined) return stop;
    if (isNonEmpty(source.stop_name)) stop.name = source.stop_name;

    const coordinates = buildCoordinates(source, serviceId, coordinateNotes);
    if (coordinates !== null) stop.coordinates = coordinates;
    return stop;
  });

  return serviceArea;
}

/**
 * Coordinates are written as numbers whenever they parse finite and in range —
 * a trailing zero is a formatting difference, not precision loss. Anything else
 * omits coordinates entirely: never partial, never a string, never clamped.
 */
function buildCoordinates(source, serviceId, coordinateNotes) {
  const lat = Number(source.stop_lat);
  const lon = Number(source.stop_lon);

  const latOk = isNonEmpty(source.stop_lat) && Number.isFinite(lat) && lat >= LAT_RANGE[0] && lat <= LAT_RANGE[1];
  const lonOk = isNonEmpty(source.stop_lon) && Number.isFinite(lon) && lon >= LON_RANGE[0] && lon <= LON_RANGE[1];

  if (!latOk || !lonOk) {
    coordinateNotes.push({
      kind: 'omitted',
      service_id: serviceId,
      stop_id: source.stop_id,
      stop_lat: source.stop_lat ?? '',
      stop_lon: source.stop_lon ?? '',
      reason: !latOk && !lonOk
        ? 'neither coordinate parses as a finite number in range'
        : (!latOk ? 'stop_lat does not parse as a finite number in range' : 'stop_lon does not parse as a finite number in range'),
    });
    return null;
  }

  if (String(lat) !== source.stop_lat || String(lon) !== source.stop_lon) {
    coordinateNotes.push({
      kind: 'reformatted',
      service_id: serviceId,
      stop_id: source.stop_id,
      source_lat: source.stop_lat,
      source_lon: source.stop_lon,
      written_lat: lat,
      written_lon: lon,
    });
  }

  const coordinates = {};
  coordinates.lat = lat;
  coordinates.lon = lon;
  return coordinates;
}

/** Document-level booking_rules, written only from what is structurally present. */
function buildBookingRules(bookingRuleRows) {
  if (bookingRuleRows.length === 0) return null;

  const advanceBooking = {};
  const channels = [];

  for (const rule of bookingRuleRows) {
    // booking_type 0 (real time) asserts nothing about lead time: minimum_minutes
    // is omitted, never set to 0.
    if (rule.booking_type !== '0' && isNonEmpty(rule.prior_notice_duration_min)) {
      const minutes = Number(rule.prior_notice_duration_min);
      if (Number.isInteger(minutes) && minutes >= 0) advanceBooking.minimum_minutes = minutes;
    }
    if (rule.booking_type !== '0' && isNonEmpty(rule.prior_notice_start_day)) {
      const days = Number(rule.prior_notice_start_day);
      if (Number.isInteger(days) && days >= 0) advanceBooking.maximum_days = days;
    }
    if (isNonEmpty(rule.booking_url) && !channels.includes('web')) channels.push('web');
    if (isNonEmpty(rule.phone_number) && !channels.includes('phone')) channels.push('phone');
  }

  const bookingRules = {};
  if (Object.keys(advanceBooking).length > 0) {
    const ordered = {};
    if ('minimum_minutes' in advanceBooking) ordered.minimum_minutes = advanceBooking.minimum_minutes;
    if ('maximum_days' in advanceBooking) ordered.maximum_days = advanceBooking.maximum_days;
    bookingRules.advance_booking = ordered;
  }
  if (channels.length > 0) bookingRules.booking_channels = channels;

  // booking_confirmation and passenger_identification are not invented from
  // booking_type: each registry has one value, but the feed states neither.
  return Object.keys(bookingRules).length > 0 ? bookingRules : null;
}

function buildReferences(bookingRuleRows, feedInfo) {
  const fromRule = bookingRuleRows.map((r) => r.info_url).find(isNonEmpty);
  const infoUrl = isNonEmpty(fromRule) ? fromRule : feedInfo.feed_contact_url;
  if (!isNonEmpty(infoUrl)) return null;

  const references = {};
  references.info_url = infoUrl;
  return references;
}

/** stops.txt columns with no MSD target, kept verbatim per stop. */
function collectStopExtras(stops, header) {
  const mapped = new Set(['stop_id', 'stop_name', 'stop_lat', 'stop_lon']);
  const extraColumns = header.filter((column) => !mapped.has(column));
  if (extraColumns.length === 0) return { columns: [], rows: [] };

  return {
    columns: extraColumns,
    rows: stops.map((stop) => {
      const kept = { stop_id: stop.stop_id };
      for (const column of extraColumns) kept[column] = stop[column];
      return kept;
    }),
  };
}
