'use strict';

/**
 * MSD → GTFS-Flex adapter (Phase 2a: discovery, no fares).
 *
 * Produces a GTFS-Flex feed (set of files) from a validated MSD object. Field
 * names and conditional requirements are taken from the live GTFS reference
 * (gtfs.org / google/transit), not from memory (CLAUDE.md §5). The generated
 * feed is gated against MobilityData gtfs-validator v7+ (see engine README).
 *
 * Mapping table and documented lossy mappings: ./README.md.
 */

// Pure conversion helpers only (no fs/path/child_process), so this adapter is
// browser-portable. loadAndValidate lives in core/msd and is used by the CLI.
const core = require('../../core/convert');

function buildFlexFeed(msd) {
  const provider = msd.provider;
  const warnings = [];

  // --- agency.txt (GTFS-required fields MSD may not carry) ---------------
  const timezone = core.countryToTimezone(provider.country);
  if (!timezone) {
    throw new Error(
      `Cannot derive agency_timezone: provider.country=${JSON.stringify(provider.country)} ` +
      `is missing or unmapped. MSD carries no timezone; extend engine/core COUNTRY_TZ.`
    );
  }
  if (!provider.url) {
    throw new Error('GTFS agency_url is required but MSD provider.url is absent; cannot emit a valid feed.');
  }
  const agencyId = provider.provider_id;
  const agencyLang = Array.isArray(provider.languages) && provider.languages.length
    ? provider.languages[0] : '';

  const agency = [{
    agency_id: agencyId,
    agency_name: provider.name,
    agency_url: provider.url,
    agency_timezone: timezone,
    agency_lang: agencyLang,
  }];

  // --- service calendar date range (MSD has none → derive, documented) ---
  const startDate = core.toYyyymmdd(msd.last_updated);
  const endDate = core.addYears(startDate, 1);

  const routes = [];
  const trips = [];
  const calendar = [];
  const calendarDates = [];
  const stopTimes = [];
  const stopsById = new Map();
  const locationGroups = [];
  const locationGroupStops = [];
  const geojsonFeatures = [];

  // --- booking_rules.txt (one rule from the top-level MSD booking_rules) -
  let bookingRuleId = null;
  const bookingRules = [];
  if (msd.booking_rules) {
    bookingRuleId = 'br-default';
    const ab = msd.booking_rules.advance_booking || {};
    const minMinutes = ab.minimum_minutes;
    const maxDays = ab.maximum_days;
    const rule = {
      booking_rule_id: bookingRuleId,
      booking_type: minMinutes != null ? 1 : 0, // advance notice → 1, else real-time → 0
      message: '',
      info_url: (msd.references && msd.references.info_url) || provider.url || '',
      booking_url: '',
    };
    if (rule.booking_type === 1) {
      rule.prior_notice_duration_min = minMinutes; // minutes (GTFS unit), required for booking_type=1
      // MSD maximum_days = booking horizon = GTFS prior_notice_start_day (earliest day),
      // NOT prior_notice_last_day (which is booking_type=2 only). See README mapping note.
      if (maxDays != null) {
        rule.prior_notice_start_day = maxDays;
        rule.prior_notice_start_time = '00:00:00';
      }
    }
    bookingRules.push(rule);
  }

  for (const service of msd.services) {
    const routeType = core.modeToRouteType(service.mode);
    if (routeType === null) {
      throw new Error(`No GTFS route_type mapping for mode=${JSON.stringify(service.mode)}.`);
    }
    routes.push({
      route_id: service.service_id,
      agency_id: agencyId,
      route_short_name: '',
      route_long_name: service.name,
      route_type: routeType,
    });

    // Resolve the flex service-area reference used by this service's stop_times.
    const area = service.service_area;
    const areaRefs = []; // [{ kind: 'location_group'|'location', id }]
    if (area.type === 'stops') {
      const lgId = `${service.service_id}-area`;
      locationGroups.push({ location_group_id: lgId, location_group_name: `${service.name} service area` });
      for (const stop of area.stops || []) {
        if (!stopsById.has(stop.stop_id)) {
          const c = stop.coordinates || {};
          stopsById.set(stop.stop_id, {
            stop_id: stop.stop_id,
            stop_name: stop.name || stop.stop_id,
            stop_lat: c.lat != null ? c.lat : '',
            stop_lon: c.lon != null ? c.lon : '',
            location_type: 0,
          });
        }
        locationGroupStops.push({ location_group_id: lgId, stop_id: stop.stop_id });
      }
      areaRefs.push({ kind: 'location_group', id: lgId });
    } else if (area.type === 'zones') {
      for (const zone of area.zones || []) {
        geojsonFeatures.push({
          type: 'Feature',
          id: zone.zone_id,
          properties: zone.name ? { name: zone.name } : {},
          geometry: zone.geometry,
        });
        areaRefs.push({ kind: 'location', id: zone.zone_id });
      }
    }

    // One calendar/trip/stop_time per distinct operating_hours.default entry,
    // since each entry can carry different days and hours (the window lives in
    // stop_times, GTFS calendar carries only the day flags + date range).
    const defaults = (service.operating_hours && service.operating_hours.default) || [];
    if (defaults.length === 0) {
      warnings.push(`Service ${service.service_id} has no operating_hours.default; no trips emitted for it.`);
    }
    defaults.forEach((oh, i) => {
      const serviceId = `${service.service_id}-oh${i}`;
      const tripId = `${service.service_id}-t${i}`;
      const flags = core.daysToCalendarFlags(oh.days);
      calendar.push({
        service_id: serviceId,
        ...flags,
        start_date: startDate,
        end_date: endDate,
      });
      trips.push({ route_id: service.service_id, service_id: serviceId, trip_id: tripId });

      const win = core.windowFromHours(oh.start, oh.end);
      // A flex trip needs >= 2 stop_times (origin + destination). For a single
      // service area (one location group / one zone) the rider is picked up and
      // dropped off within the same area, so the single ref is emitted twice as
      // pickup (seq 1) and drop-off (seq 2). Multi-zone services list each zone.
      const refsForTrip = areaRefs.length === 1 ? [areaRefs[0], areaRefs[0]] : areaRefs;
      refsForTrip.forEach((ref, j) => {
        stopTimes.push({
          trip_id: tripId,
          stop_sequence: j + 1,
          stop_id: '',
          location_id: ref.kind === 'location' ? ref.id : '',
          location_group_id: ref.kind === 'location_group' ? ref.id : '',
          start_pickup_drop_off_window: win.start,
          end_pickup_drop_off_window: win.end,
          // 0 (regular) is forbidden with a window; 2 = "arrange via agency" pairs
          // with the linked booking rule, which carries the actual channel (app/web).
          pickup_type: 2,
          drop_off_type: 2,
          pickup_booking_rule_id: bookingRuleId || '',
          drop_off_booking_rule_id: bookingRuleId || '',
        });
      });

      // Dated exceptions for this service apply to its derived calendar.
      const exceptions = (service.operating_hours && service.operating_hours.exceptions) || [];
      for (const ex of exceptions) {
        calendarDates.push({
          service_id: serviceId,
          date: core.toYyyymmdd(ex.date),
          exception_type: ex.closed ? 2 : 1,
        });
      }
    });
  }

  // --- assemble files ----------------------------------------------------
  const files = {};
  files['agency.txt'] = core.toCsv(
    ['agency_id', 'agency_name', 'agency_url', 'agency_timezone', 'agency_lang'], agency);
  files['routes.txt'] = core.toCsv(
    ['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_type'], routes);
  files['trips.txt'] = core.toCsv(['route_id', 'service_id', 'trip_id'], trips);
  files['calendar.txt'] = core.toCsv(
    ['service_id', ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      'start_date', 'end_date'], calendar);
  if (calendarDates.length) {
    files['calendar_dates.txt'] = core.toCsv(['service_id', 'date', 'exception_type'], calendarDates);
  }
  files['stop_times.txt'] = core.toCsv(
    ['trip_id', 'stop_sequence', 'stop_id', 'location_id', 'location_group_id',
      'start_pickup_drop_off_window', 'end_pickup_drop_off_window',
      'pickup_type', 'drop_off_type', 'pickup_booking_rule_id', 'drop_off_booking_rule_id'], stopTimes);

  if (stopsById.size) {
    files['stops.txt'] = core.toCsv(
      ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'location_type'], [...stopsById.values()]);
  }
  if (locationGroups.length) {
    files['location_groups.txt'] = core.toCsv(
      ['location_group_id', 'location_group_name'], locationGroups);
    files['location_group_stops.txt'] = core.toCsv(
      ['location_group_id', 'stop_id'], locationGroupStops);
  }
  if (geojsonFeatures.length) {
    files['locations.geojson'] = JSON.stringify(
      { type: 'FeatureCollection', features: geojsonFeatures }, null, 2) + '\n';
  }
  if (bookingRules.length) {
    files['booking_rules.txt'] = core.toCsv(
      ['booking_rule_id', 'booking_type', 'prior_notice_duration_min',
        'prior_notice_start_day', 'prior_notice_start_time',
        'message', 'info_url', 'booking_url'], bookingRules);
  }
  files['feed_info.txt'] = core.toCsv(
    ['feed_publisher_name', 'feed_publisher_url', 'feed_lang', 'feed_contact_url',
      'feed_start_date', 'feed_end_date', 'feed_version'],
    [{ feed_publisher_name: provider.name, feed_publisher_url: provider.url,
      feed_lang: agencyLang || 'en', feed_contact_url: provider.url,
      feed_start_date: startDate, feed_end_date: endDate,
      feed_version: `msd-${msd.msd_version}-${startDate}` }]);

  return { files, warnings };
}

module.exports = { buildFlexFeed };
