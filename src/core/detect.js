/**
 * detect.js — kind detection and fence (P1.2)
 *
 * Pure: no fs, no path, no process, no os, no url, no child_process.
 *
 * The fence is a first-class check (blueprint C.0.2), not an incidental
 * failure. It applies to the feed as a whole, never per route: a feed that
 * mixes a conforming flex route with a non-conforming one is refused whole,
 * because skipping routes would emit a document that looks complete while
 * showing a partial picture (docs/mapping.md, fence).
 *
 * Every refusal is a structured return value — never a thrown exception, never
 * console output — carrying a one-sentence reason and the evidence: which file
 * or field was present or absent, and any offending value verbatim.
 */

/** The only route types the MSD mode registry can express at v0.1.0. */
const ACCEPTED_ROUTE_TYPES = ['3', '715'];

export const REFUSAL_CODES = [
  'geojson_zone_kind',
  'unsupported_route_type',
  'multi_group_route',
  'divergent_booking_rules',
  'not_flex',
  'mixed_route_kinds',
  'unrecognised',
];

const refuse = (code, message, evidence) => ({
  accepted: false,
  kind: null,
  reason: { code, message, evidence },
  routes: [],
});

const rowsOf = (feed, name) => feed.files?.[name] ?? [];
const hasFile = (feed, name) => (feed.present ?? []).includes(name);

/**
 * Classify a feed read by readFeed().
 *
 * @param {{files: object, raw: object, present: string[]}} feed
 * @returns {{
 *   accepted: boolean,
 *   kind: 'location_group'|null,
 *   reason: null | {code: string, message: string, evidence: object},
 *   routes: Array<{route_id: string, route_type: string, location_group_id: string,
 *                  trip_ids: string[], service_ids: string[], booking_rule_ids: string[]}>
 * }}
 */
export function detectKind(feed) {
  const present = feed?.present ?? [];

  // ---------------------------------------------------------- unrecognised
  if (present.length === 0) {
    return refuse('unrecognised', 'The input carries no readable files.', { present: [] });
  }
  if (!hasFile(feed, 'routes.txt') || !hasFile(feed, 'agency.txt')) {
    return refuse(
      'unrecognised',
      'The input does not look like a GTFS feed: agency.txt or routes.txt is absent.',
      {
        present,
        absent: ['agency.txt', 'routes.txt'].filter((f) => !hasFile(feed, f)),
      },
    );
  }

  const routes = rowsOf(feed, 'routes.txt');
  if (routes.length === 0) {
    return refuse('unrecognised', 'routes.txt carries no data rows.', { file: 'routes.txt', rows: 0 });
  }

  // ------------------------------------------------- fence edge (a): zones
  if (hasFile(feed, 'locations.geojson')) {
    return refuse(
      'geojson_zone_kind',
      'The feed expresses flex service through locations.geojson, which is the GeoJSON-zone kind and out of scope for this bridge.',
      { file: 'locations.geojson', present: true },
    );
  }
  const stopTimes = rowsOf(feed, 'stop_times.txt');
  const withLocationId = stopTimes.filter((r) => (r.location_id ?? '') !== '');
  if (withLocationId.length > 0) {
    return refuse(
      'geojson_zone_kind',
      'stop_times.txt references location_id, which names a GeoJSON zone rather than a location group.',
      {
        file: 'stop_times.txt',
        field: 'location_id',
        rows: withLocationId.length,
        values: [...new Set(withLocationId.map((r) => r.location_id))],
      },
    );
  }

  // ------------------------------------------------------------- not flex
  const missingFlexFiles = ['location_groups.txt', 'location_group_stops.txt']
    .filter((f) => !hasFile(feed, f));
  if (missingFlexFiles.length > 0) {
    return refuse(
      'not_flex',
      'The feed carries no location groups, so it is ordinary scheduled GTFS rather than GTFS-Flex.',
      { absent: missingFlexFiles, present },
    );
  }

  // --------------------------------- fence edge (b), applied to every route
  const offendingType = routes.filter((r) => !ACCEPTED_ROUTE_TYPES.includes(r.route_type ?? ''));
  if (offendingType.length > 0) {
    return refuse(
      'unsupported_route_type',
      `route_type ${offendingType.map((r) => `"${r.route_type}"`).join(', ')} is outside {3, 715}; the MSD mode registry at v0.1.0 permits only "bus", so it is not expressible.`,
      {
        file: 'routes.txt',
        field: 'route_type',
        accepted: ACCEPTED_ROUTE_TYPES,
        offending: offendingType.map((r) => ({ route_id: r.route_id, route_type: r.route_type })),
      },
    );
  }

  // ------------------------------------- route -> trips -> location groups
  const trips = rowsOf(feed, 'trips.txt');
  const tripsByRoute = new Map();
  for (const t of trips) {
    const list = tripsByRoute.get(t.route_id) ?? [];
    list.push(t);
    tripsByRoute.set(t.route_id, list);
  }
  const stopTimesByTrip = new Map();
  for (const s of stopTimes) {
    const list = stopTimesByTrip.get(s.trip_id) ?? [];
    list.push(s);
    stopTimesByTrip.set(s.trip_id, list);
  }

  const linked = [];
  for (const route of routes) {
    const routeTrips = tripsByRoute.get(route.route_id) ?? [];
    const rowsForRoute = routeTrips.flatMap((t) => stopTimesByTrip.get(t.trip_id) ?? []);
    const groups = [...new Set(rowsForRoute.map((r) => r.location_group_id ?? '').filter((g) => g !== ''))];
    // Union of both link fields across the route: a flex trip carries the rule
    // on the pickup link of one row and the drop-off link of the other, leaving
    // the counterpart blank, so either field alone sees half the picture
    // (docs/mapping.md, booking-link note).
    const bookingRuleIds = [...new Set(
      rowsForRoute
        .flatMap((r) => [r.pickup_booking_rule_id ?? '', r.drop_off_booking_rule_id ?? ''])
        .filter((id) => id !== ''),
    )].sort();

    if (groups.length === 0) {
      // Not `not_flex`: this feed IS flex, in part. Telling the publisher it is
      // not would misdescribe data they can see for themselves.
      return refuse(
        'mixed_route_kinds',
        `Route "${route.route_id}" reaches no location group through trips and stop_times, so the feed mixes flex and non-flex routes and is refused whole.`,
        {
          route_id: route.route_id,
          route_type: route.route_type,
          trip_ids: routeTrips.map((t) => t.trip_id),
          stop_times_rows: rowsForRoute.length,
        },
      );
    }
    if (groups.length > 1) {
      return refuse(
        'multi_group_route',
        `Route "${route.route_id}" references ${groups.length} location groups; merging them would assert a service area the feed does not state, and splitting the route would invent service identities it does not carry.`,
        {
          route_id: route.route_id,
          file: 'stop_times.txt',
          field: 'location_group_id',
          location_group_ids: groups,
        },
      );
    }

    linked.push({
      route_id: route.route_id,
      route_type: route.route_type,
      location_group_id: groups[0],
      trip_ids: routeTrips.map((t) => t.trip_id),
      service_ids: [...new Set(routeTrips.map((t) => t.service_id))],
      booking_rule_ids: bookingRuleIds,
    });
  }

  // --------------------------------------------- divergent booking rules
  // MSD holds booking_rules and references once per document while services is
  // an array (docs/mapping.md, Finding 3). Across several routes the document
  // level can only be written when every route says the same thing.
  if (linked.length > 1) {
    const bookingRules = rowsOf(feed, 'booking_rules.txt');
    const infoUrlOf = (id) => bookingRules.find((b) => b.booking_rule_id === id)?.info_url ?? '';

    const signatures = linked.map((r) => ({
      route_id: r.route_id,
      booking_rule_ids: r.booking_rule_ids,
      info_urls: [...new Set(r.booking_rule_ids.map(infoUrlOf))].sort(),
    }));
    const key = (s) => JSON.stringify([s.booking_rule_ids, s.info_urls]);
    const distinct = [...new Set(signatures.map(key))];

    if (distinct.length > 1) {
      return refuse(
        'divergent_booking_rules',
        'The routes reference different booking rules or info URLs, and MSD holds booking_rules and references once per document, so neither writing one route’s rule document-wide nor merging them is available.',
        {
          file: 'booking_rules.txt',
          fields: ['booking_rule_id', 'info_url'],
          per_route: signatures,
        },
      );
    }
  }

  return { accepted: true, kind: 'location_group', reason: null, routes: linked };
}
