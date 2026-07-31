'use strict';

/**
 * MSD engine — pure conversion utilities.
 *
 * The adapter-neutral, side-effect-free half of the engine core: small helpers
 * that map MSD field values to GTFS field values. NO `fs` / `path` /
 * `child_process` / `process` — this module is safe to bundle for the browser.
 *
 * Split out of core/msd.js (which retains the Node-only load+validate path) so
 * the conversion logic is portable; the helper bodies are unchanged.
 */

// --- conversion utilities -------------------------------------------------

/**
 * Map an ISO 3166-1 alpha-2 country to a default IANA timezone for
 * agency_timezone (GTFS-required; MSD carries no timezone field). Single-zone
 * countries only; unknown → null (caller aborts with a clear message).
 */
const COUNTRY_TZ = {
  CH: 'Europe/Zurich',
  UG: 'Africa/Kampala',
};
function countryToTimezone(country) {
  return COUNTRY_TZ[country] || null;
}

/** GTFS route_type for an MSD mode. v0.1.0 mode registry = ["bus"] → 3. */
const MODE_ROUTE_TYPE = { bus: 3 };
function modeToRouteType(mode) {
  return Object.prototype.hasOwnProperty.call(MODE_ROUTE_TYPE, mode) ? MODE_ROUTE_TYPE[mode] : null;
}

/**
 * Convert "HH:MM" to a GTFS time "HH:MM:SS". When end <= start the window
 * crosses midnight, so the end is expressed in GTFS extended hours (>= 24:00:00).
 */
function hhmmToSeconds(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 3600 + m * 60;
}
function secondsToGtfsTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
/** Returns { start, end } as GTFS times; end is pushed to next day if needed. */
function windowFromHours(startHHMM, endHHMM) {
  const start = hhmmToSeconds(startHHMM);
  let end = hhmmToSeconds(endHHMM);
  if (end <= start) end += 24 * 3600; // crosses midnight (incl. "00:00")
  return { start: secondsToGtfsTime(start), end: secondsToGtfsTime(end) };
}

const DAY_KEYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
const DAY_COLS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
/** MSD day list (["mo","fr",...]) → { monday:0|1, ... } calendar flags. */
function daysToCalendarFlags(days) {
  const set = new Set((days || []).map((d) => d.toLowerCase()));
  const flags = {};
  DAY_KEYS.forEach((k, i) => { flags[DAY_COLS[i]] = set.has(k) ? 1 : 0; });
  return flags;
}

/** "2026-03-09T00:00:00Z" or "2026-03-09" → "20260309". */
function toYyyymmdd(isoLike) {
  const d = String(isoLike).slice(0, 10).replace(/-/g, '');
  return d;
}
/** Add whole years to a "YYYYMMDD" string. */
function addYears(yyyymmdd, n) {
  const y = Number(yyyymmdd.slice(0, 4)) + n;
  return `${y}${yyyymmdd.slice(4)}`;
}

// --- CSV ------------------------------------------------------------------

function csvField(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/** Build a CSV string from a header array and an array of row objects. */
function toCsv(header, rows) {
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map((h) => csvField(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

module.exports = {
  countryToTimezone,
  modeToRouteType,
  windowFromHours,
  daysToCalendarFlags,
  toYyyymmdd,
  addYears,
  toCsv,
};
