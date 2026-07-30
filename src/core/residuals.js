/**
 * residuals.js — the residual report (P1.4)
 *
 * Pure. A structured object, never console text.
 *
 * Each entry carries a category, a class, a short neutral statement, and
 * exactly one **model coverage** disposition:
 *
 *   field_exists          The schema defines the field. The feed says nothing,
 *                         so the key is absent. The asymmetry is the point: the
 *                         model can express it, this feed does not.
 *   documented_candidate  The schema has no such field, and the absence is
 *                         already tracked upstream as a candidate for a future
 *                         version. Only names from the upstream register appear
 *                         here.
 *   undocumented_gap      The schema has no such field and no candidate is
 *                         tracked for it. This is **an observation about the
 *                         model's coverage — not a defect, not a request and
 *                         not a proposal.** Each such entry says so.
 *
 * The class is a separate axis and describes where the loss comes from:
 *
 *   (a) format gap        MSD v0.1.0 structurally cannot express it.
 *   (b) feed omission     The format could express it; this feed does not carry it.
 *   (c) conversion        Meaning is lost or degraded in the direction of travel.
 *
 * Only field_exists is verifiable from this repository — against
 * vendor/msd/schema/v0.1.0/msd.schema.json, which a test does. The candidate
 * names come from an upstream register that is not vendored here. See
 * docs/mapping.md, "Provenance of the coverage dispositions".
 *
 * TONE. Descriptive, never accusatory. "The feed does not carry fare
 * information", not "the feed fails to provide fares". This is not politeness:
 * the report's credibility depends on a reader recognising it as a description
 * of a format boundary rather than a complaint about a publisher. A feed
 * omission is a choice the publisher made — often a deliberate one — and the
 * report has no standing to grade it.
 */

const OBSERVATION = 'An observation about the coverage of MSD v0.1.0 — not a defect, not a request and not a proposal.';

/** The schema defines this field; the feed simply says nothing. */
const fieldExists = (field) => ({ model_coverage: 'field_exists', field });

/** No such field, and the absence is tracked upstream under this name. */
const documentedCandidate = (candidate) => ({ model_coverage: 'documented_candidate', candidate });

/** No such field and no tracked candidate. */
const undocumentedGap = () => ({ model_coverage: 'undocumented_gap', coverage_note: OBSERVATION });

const entry = (category, klass, statement, coverage, extra = {}) => {
  const out = {};
  out.category = category;
  out.class = klass;
  out.statement = statement;
  out.model_coverage = coverage.model_coverage;
  if (coverage.field !== undefined) out.field = coverage.field;
  if (coverage.candidate !== undefined) out.candidate = coverage.candidate;
  if (coverage.coverage_note !== undefined) out.coverage_note = coverage.coverage_note;
  if (extra.evidence !== undefined) out.evidence = extra.evidence;
  return out;
};

const has = (rows) => Array.isArray(rows) && rows.length > 0;

/**
 * @param {{msd: object, feed: object, classification: object, provenance: object,
 *          coordinateNotes: object[], exceptionConflicts: object[]}} ctx
 * @returns {object[]} residual entries, in a fixed order
 */
export function buildResiduals(ctx) {
  const { msd, feed, provenance, coordinateNotes, exceptionConflicts = [] } = ctx;
  const rows = (name) => feed.files[name] ?? [];
  const residuals = [];

  /* --------------------------------------------- (b) what the feed omits */

  residuals.push(entry(
    'rider_eligibility', 'b',
    'The feed does not carry rider eligibility conditions — who may use the service, and under what circumstances. GTFS-Flex has no field for them and MSD v0.1.0 has no key for them, so nothing is asserted about eligibility either way.',
    documentedCandidate('eligibility'),
  ));

  residuals.push(entry(
    'membership_requirement', 'b',
    'The feed does not state whether membership or registration is a precondition of booking, nor any lead time such a registration would need. Nothing in the document implies that booking is open to all.',
    documentedCandidate('membership_requirement'),
  ));

  residuals.push(entry(
    'per_channel_booking_metadata', 'b',
    'The feed states which booking channels exist, but not their hours, credentials or capabilities. Those are described in the free-text booking message, which is preserved verbatim in diagnostics and never parsed into fields.',
    documentedCandidate('booking-channel object shape'),
  ));

  residuals.push(entry(
    'fares', 'b',
    'MSD can express fares: fare_structures is defined in the schema. This feed carries no fare information — no fare_attributes.txt, fare_rules.txt or fare product files — so the key is absent rather than empty.',
    fieldExists('fare_structures'),
  ));

  residuals.push(entry(
    'payment_methods', 'b',
    'MSD can express accepted payment methods, within a fare structure. This feed states none, and carries no fare structure to hold them, so the key is absent.',
    fieldExists('payment_methods'),
  ));

  residuals.push(entry(
    'organisational_parties', 'b',
    'MSD can express the legal entity behind a provider, with its registration and VAT identifiers. This feed identifies the operating agency only, so provider.legal_entity is absent.',
    fieldExists('legal_entity'),
  ));

  residuals.push(entry(
    'vehicles', 'b',
    'MSD can express the fleet: vehicle types, seat and wheelchair capacities, propulsion and counts. This feed describes none of it, so the key is absent — and no accessibility assertion is derived, because an absent wheelchair_boarding in GTFS is not the same statement as MSD false.',
    fieldExists('vehicles'),
  ));

  const bookingRules = rows('booking_rules.txt');
  const withoutBookingUrl = bookingRules.filter((b) => !b.booking_url);
  if (has(withoutBookingUrl)) {
    residuals.push(entry(
      'web_booking_channel', 'b',
      'MSD can express a web booking channel: "web" is a value of the booking_channel code list. This feed leaves booking_url empty, so no web channel is asserted — the channel list is built from what is structurally present and never inferred from the booking message, which may describe a portal the feed does not name.',
      fieldExists('booking_channels'),
      { evidence: { source_field: 'booking_rules.booking_url', value: '' } },
    ));
  }

  /* --------------------------------------------------- (a) format gaps */

  const agency = rows('agency.txt')[0] ?? {};
  if (agency.agency_phone) {
    residuals.push(entry(
      'provider_telephone', 'a',
      'The feed carries a provider telephone number. MSD v0.1.0 provider has no telephone property — only contact_email — so the number is kept in diagnostics rather than written to the document.',
      undocumentedGap(),
      { evidence: { source_field: 'agency.agency_phone' } },
    ));
  }

  const routesWithDesc = rows('routes.txt').filter((r) => r.route_desc);
  if (has(routesWithDesc)) {
    residuals.push(entry(
      'service_description', 'a',
      'The feed carries a description for each route. MSD v0.1.0 service has no description property, although provider does, so the text is kept in diagnostics.',
      undocumentedGap(),
      { evidence: { source_field: 'routes.route_desc', routes: routesWithDesc.map((r) => r.route_id) } },
    ));
  }

  const stopHeader = feed.headers?.['stops.txt'] ?? [];
  const extraStopColumns = stopHeader.filter((c) => !['stop_id', 'stop_name', 'stop_lat', 'stop_lon'].includes(c));
  if (has(extraStopColumns)) {
    residuals.push(entry(
      'stop_metadata', 'a',
      'The feed carries stop columns beyond identity, name and position. An MSD stop holds only stop_id, name and coordinates, so the remaining columns are kept in diagnostics.',
      undocumentedGap(),
      { evidence: { columns: extraStopColumns } },
    ));
  }

  const groupNames = rows('location_groups.txt').filter((g) => g.location_group_name);
  if (has(groupNames)) {
    residuals.push(entry(
      'location_group_name', 'a',
      'The location group carries a name. MSD service_area has no name property, so the group name is kept in diagnostics; the group itself becomes the stops-based service area.',
      undocumentedGap(),
      { evidence: { source_field: 'location_groups.location_group_name' } },
    ));
  }

  const withPhone = bookingRules.filter((b) => b.phone_number);
  if (has(withPhone)) {
    residuals.push(entry(
      'booking_phone_number', 'a',
      'The booking rule carries a telephone number. MSD records that a phone channel exists but has no field for the number itself, so it is kept in diagnostics.',
      documentedCandidate('booking-channel object shape'),
      { evidence: { source_field: 'booking_rules.phone_number' } },
    ));
  }

  const withLastDay = bookingRules.filter((b) => b.prior_notice_last_day);
  if (has(withLastDay)) {
    residuals.push(entry(
      'booking_last_day', 'a',
      'The booking rule states a latest booking day. MSD advance_booking models the horizon and the minimum lead time, but has no field for a latest day, so it is kept in diagnostics.',
      undocumentedGap(),
      { evidence: { source_field: 'booking_rules.prior_notice_last_day' } },
    ));
  }

  const withDurationMax = bookingRules.filter((b) => b.prior_notice_duration_max);
  if (has(withDurationMax)) {
    residuals.push(entry(
      'booking_maximum_notice', 'a',
      'The booking rule states a maximum notice in minutes. MSD has no maximum-notice-in-minutes field, so it is kept in diagnostics.',
      undocumentedGap(),
      { evidence: { source_field: 'booking_rules.prior_notice_duration_max' } },
    ));
  }

  const freeText = bookingRules.filter((b) => b.message || b.pickup_message || b.drop_off_message);
  if (has(freeText)) {
    residuals.push(entry(
      'booking_instructions_free_text', 'a',
      'The booking rule carries free-text instructions for riders. MSD has no field for them and this bridge does not parse prose into structured fields, so the text is preserved verbatim in diagnostics.',
      undocumentedGap(),
      { evidence: { source_field: 'booking_rules.message' } },
    ));
  }

  if (has(exceptionConflicts)) {
    residuals.push(entry(
      'calendar_selective_closure', 'a',
      'Some dates are treated as exceptions by part of a service only: several calendars were merged into one service, and these dates are removed or added by some of them and not others. MSD models exceptions per service rather than per calendar, so no exception entry is written for those dates — an entry marking the whole service closed would be false for the riders the other calendars serve. The dates and the calendars on each side are recorded in diagnostics.',
      undocumentedGap(),
      {
        evidence: {
          dates: exceptionConflicts.map((c) => c.date),
          services: [...new Set(exceptionConflicts.map((c) => c.service_id))],
        },
      },
    ));
  }

  for (const note of coordinateNotes.filter((n) => n.kind === 'omitted')) {
    residuals.push(entry(
      'stop_coordinates', 'a',
      'MSD can express a stop position: coordinates is defined on a stop. This stop carries values that do not parse as finite numbers within the schema range, so it is written without coordinates rather than with a rounded, clamped or partial position, and keeps its identifier and name.',
      fieldExists('coordinates'),
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
      'Each calendar states the date range over which it applies. MSD operating_hours models weekly patterns and dated exceptions but carries no validity range for the service, so a reader of the document cannot see when the pattern began or when it is expected to end.',
      documentedCandidate('service-level valid_from / valid_until'),
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
      'The feed states a date until which the feed itself is valid. That is a statement about the document rather than about the service, and MSD has no equivalent field, so a consumer cannot see when the publisher expects this description to be superseded.',
      undocumentedGap(),
      { evidence: { source_field: 'feed_info.feed_end_date', value: feedInfo.feed_end_date } },
    ));
  }

  const level = provenance?.last_updated?.level;
  if (typeof level === 'number' && level > 1) {
    residuals.push(entry(
      'document_freshness', 'c',
      'MSD can express when a description was last revised: last_updated is required and is present. This publisher declares no such date of its own, so the value was derived from a date the feed states for another purpose — the provenance records which.',
      fieldExists('last_updated'),
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
      'An operating window ends earlier in the day than it starts, which reads as a window crossing midnight. The canonical reference example carries entries of that shape, but MSD v0.1.0 formalises no wrap-around semantics, so a consumer following the schema alone is not obliged to read it that way.',
      undocumentedGap(),
      { evidence: { windows: wrapAround } },
    ));
  }

  const translations = rows('translations.txt');
  if (has(translations)) {
    residuals.push(entry(
      'translations', 'c',
      'The feed carries translated labels for stop, route and agency names. They are secondary labels rather than names, and MSD v0.1.0 has no field for alternates, so they are kept in diagnostics and never substituted into any name in the document. The absence of an alternate-name field is a recorded observation upstream and explicitly not a candidate for a future version.',
      undocumentedGap(),
      { evidence: { rows: translations.length, languages: [...new Set(translations.map((t) => t.language))] } },
    ));
  }

  return residuals;
}
