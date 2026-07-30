/**
 * residuals.js — the residual report (P1.4)
 *
 * Pure. A structured object, never console text.
 *
 * Each entry carries a category, a class, a short neutral statement and — where
 * one exists — the name of the documented v0.2.0 candidate it corresponds to.
 *
 *   (a) format gap          MSD v0.1.0 structurally cannot express it.
 *   (b) feed omission       The format could express it; this feed does not carry it.
 *   (c) conversion          Meaning is lost or degraded in the direction of travel.
 *
 * TONE. Descriptive, never accusatory. "The feed does not carry fare
 * information", not "the feed fails to provide fares". This is not politeness:
 * the report's credibility depends on a reader recognising it as a description
 * of a format boundary rather than a complaint about a publisher. A feed
 * omission is a choice the publisher made — often a deliberate one — and the
 * report has no standing to grade it.
 */

const entry = (category, klass, statement, extra = {}) => {
  const out = {};
  out.category = category;
  out.class = klass;
  out.statement = statement;
  if (extra.v0_2_0_candidate !== undefined) out.v0_2_0_candidate = extra.v0_2_0_candidate;
  if (extra.evidence !== undefined) out.evidence = extra.evidence;
  return out;
};

const has = (rows) => Array.isArray(rows) && rows.length > 0;

/**
 * @param {{msd: object, feed: object, classification: object, provenance: object,
 *          coordinateNotes: object[]}} ctx
 * @returns {object[]} residual entries, in a fixed order
 */
export function buildResiduals(ctx) {
  const { msd, feed, provenance, coordinateNotes } = ctx;
  const rows = (name) => feed.files[name] ?? [];
  const residuals = [];

  /* --------------------------------------------- (b) what the feed omits */

  residuals.push(entry(
    'rider_eligibility_and_membership', 'b',
    'The feed does not carry rider eligibility or membership conditions. GTFS-Flex has no field for them, and MSD v0.1.0 has no key for them either, so nothing is asserted about who may use the service.',
    { v0_2_0_candidate: 'eligibility' },
  ));

  residuals.push(entry(
    'per_channel_booking_metadata', 'b',
    'The feed states which booking channels exist, but not their hours, languages or per-channel conditions. Those are recorded as free text in the booking message, which is preserved verbatim in diagnostics and not parsed.',
    { v0_2_0_candidate: 'booking_channel_detail' },
  ));

  residuals.push(entry(
    'fares', 'b',
    'The feed does not carry fare information: no fare_attributes.txt, fare_rules.txt or fare product files are present. The MSD fare_structures key is therefore absent rather than empty.',
    { v0_2_0_candidate: 'fare_structures' },
  ));

  residuals.push(entry(
    'payment_methods', 'b',
    'The feed does not state which payment methods the service accepts. MSD models payment methods only within a fare structure, and no fare structure is present.',
    { v0_2_0_candidate: 'payment_methods' },
  ));

  residuals.push(entry(
    'organisational_parties', 'b',
    'The feed identifies the operating agency but no legal entity behind it — no registration or VAT identifier. MSD provider.legal_entity is therefore absent.',
    { v0_2_0_candidate: 'legal_entity' },
  ));

  residuals.push(entry(
    'vehicles', 'b',
    'The feed does not describe the fleet: no vehicle types, capacities, wheelchair spaces or propulsion. The MSD vehicles key is absent, and no accessibility assertion is derived — an absent wheelchair_boarding in GTFS is not the same statement as MSD false.',
    { v0_2_0_candidate: 'vehicles' },
  ));

  /* --------------------------------------------------- (a) format gaps */

  const agency = rows('agency.txt')[0] ?? {};
  if (agency.agency_phone) {
    residuals.push(entry(
      'provider_telephone', 'a',
      'The feed carries a provider telephone number. MSD v0.1.0 provider has no telephone property — only contact_email — so the number is kept in diagnostics rather than written to the document.',
      { v0_2_0_candidate: 'provider.phone', evidence: { source_field: 'agency.agency_phone' } },
    ));
  }

  const routesWithDesc = rows('routes.txt').filter((r) => r.route_desc);
  if (has(routesWithDesc)) {
    residuals.push(entry(
      'service_description', 'a',
      'The feed carries a description for each route. MSD v0.1.0 service has no description property, unlike provider, so the text is kept in diagnostics.',
      {
        v0_2_0_candidate: 'service.description',
        evidence: { source_field: 'routes.route_desc', routes: routesWithDesc.map((r) => r.route_id) },
      },
    ));
  }

  const stopHeader = feed.headers?.['stops.txt'] ?? [];
  const extraStopColumns = stopHeader.filter((c) => !['stop_id', 'stop_name', 'stop_lat', 'stop_lon'].includes(c));
  if (has(extraStopColumns)) {
    residuals.push(entry(
      'stop_metadata', 'a',
      'The feed carries stop columns beyond identity, name and position. An MSD stop holds only stop_id, name and coordinates, so the remaining columns are kept in diagnostics.',
      { evidence: { columns: extraStopColumns } },
    ));
  }

  const groupNames = rows('location_groups.txt').filter((g) => g.location_group_name);
  if (has(groupNames)) {
    residuals.push(entry(
      'location_group_name', 'a',
      'The location group carries a name. MSD service_area has no name property, so the group name is kept in diagnostics; the group itself becomes the stops-based service area.',
      { evidence: { source_field: 'location_groups.location_group_name' } },
    ));
  }

  const bookingRules = rows('booking_rules.txt');
  const withPhone = bookingRules.filter((b) => b.phone_number);
  if (has(withPhone)) {
    residuals.push(entry(
      'booking_phone_number', 'a',
      'The booking rule carries a telephone number. MSD records that a phone channel exists but has no field for the number itself, so it is kept in diagnostics.',
      { v0_2_0_candidate: 'booking_channel_detail', evidence: { source_field: 'booking_rules.phone_number' } },
    ));
  }

  const withLastDay = bookingRules.filter((b) => b.prior_notice_last_day);
  if (has(withLastDay)) {
    residuals.push(entry(
      'booking_last_day', 'a',
      'The booking rule states a latest booking day. MSD advance_booking models the horizon and the minimum lead time, but has no field for a latest day, so it is kept in diagnostics.',
      { evidence: { source_field: 'booking_rules.prior_notice_last_day' } },
    ));
  }

  const withDurationMax = bookingRules.filter((b) => b.prior_notice_duration_max);
  if (has(withDurationMax)) {
    residuals.push(entry(
      'booking_maximum_notice', 'a',
      'The booking rule states a maximum notice in minutes. MSD has no maximum-notice-in-minutes field, so it is kept in diagnostics.',
      { evidence: { source_field: 'booking_rules.prior_notice_duration_max' } },
    ));
  }

  const freeText = bookingRules.filter((b) => b.message || b.pickup_message || b.drop_off_message);
  if (has(freeText)) {
    residuals.push(entry(
      'booking_instructions_free_text', 'a',
      'The booking rule carries free-text instructions for riders. MSD has no field for them and this bridge does not parse prose into structured fields, so the text is preserved verbatim in diagnostics.',
      { evidence: { source_field: 'booking_rules.message' } },
    ));
  }

  for (const note of coordinateNotes.filter((n) => n.kind === 'omitted')) {
    residuals.push(entry(
      'stop_coordinates', 'a',
      'A stop carries coordinates that do not parse as finite numbers within the schema range, so the stop is written without coordinates rather than with a rounded, clamped or partial position. The stop keeps its identifier and name.',
      {
        evidence: {
          stop_id: note.stop_id, stop_lat: note.stop_lat, stop_lon: note.stop_lon, reason: note.reason,
        },
      },
    ));
  }

  /* ------------------------------------ (c) conversion and staleness */

  const calendars = rows('calendar.txt');
  if (has(calendars)) {
    residuals.push(entry(
      'service_calendar_range', 'c',
      'Each calendar states the date range over which it applies. MSD operating_hours models weekly patterns and dated exceptions but has no calendar validity range, so the range is not carried into the document.',
      {
        evidence: {
          source_fields: ['calendar.start_date', 'calendar.end_date'],
          ranges: [...new Set(calendars.map((c) => `${c.start_date}–${c.end_date}`))],
        },
      },
    ));
  }

  const feedInfo = rows('feed_info.txt')[0] ?? {};
  if (feedInfo.feed_end_date) {
    residuals.push(entry(
      'feed_validity_end', 'c',
      'The feed states a date until which it is valid. MSD has no equivalent field, so a consumer of the document cannot see when the publisher expects it to be superseded.',
      { evidence: { source_field: 'feed_info.feed_end_date', value: feedInfo.feed_end_date } },
    ));
  }

  const level = provenance?.last_updated?.level;
  if (typeof level === 'number' && level > 1) {
    residuals.push(entry(
      'document_freshness', 'c',
      'The publisher declares no document freshness of its own: last_updated was derived from a date the feed states for another purpose, not from a statement about when this description was last revised.',
      { evidence: provenance.last_updated },
    ));
  }

  const wrapAround = [];
  for (const service of msd?.services ?? []) {
    for (const window of service.operating_hours?.default ?? []) {
      if (window.end < window.start) {
        wrapAround.push({ service_id: service.service_id, start: window.start, end: window.end });
      }
    }
  }
  if (has(wrapAround)) {
    residuals.push(entry(
      'midnight_crossing_window', 'c',
      'An operating window ends earlier in the day than it starts, which reads as a window crossing midnight. The canonical reference example carries entries of that shape, but MSD v0.1.0 does not formalise wrap-around, so a consumer following the schema alone is not obliged to read it that way.',
      { evidence: { windows: wrapAround } },
    ));
  }

  const translations = rows('translations.txt');
  if (has(translations)) {
    residuals.push(entry(
      'translations', 'c',
      'The feed carries translated labels for stop, route and agency names. They are secondary labels rather than names, and MSD v0.1.0 has no field for alternates, so they are kept in diagnostics and never substituted into any name in the document.',
      {
        v0_2_0_candidate: 'name_translations',
        evidence: { rows: translations.length, languages: [...new Set(translations.map((t) => t.language))] },
      },
    ));
  }

  return residuals;
}
