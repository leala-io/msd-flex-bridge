/**
 * card-map.js — the service area as plain inline SVG (P3/K.4)
 *
 * No basemap, and therefore no map library, no bundle step and no CDN. A
 * backdrop needs tiles, tiles need a network call at runtime, and this
 * repository makes none. That is not a compromise the drawing has to apologise
 * for: what the area must show — where it is, how far it reaches, how densely it
 * is served — is carried entirely by the points. A backdrop would add a runtime
 * dependency, an attribution obligation and a second network exception for no
 * evidential gain.
 *
 * Pure: no host imports, no wall clock, no randomness. The same coordinates
 * always produce the same bytes.
 *
 * **What is a value and what is a drawing aid.** The points and the bounding-box
 * numbers are values the document carries. The scale bar's length, and the
 * projection that places a point at a pixel, are computed here. They are drawing
 * aids and the card labels them as such — they are never presented as something
 * the feed states.
 */

/** Equirectangular, with the longitude axis corrected at the mid-latitude. */
const RAD = Math.PI / 180;

/** Metres per degree of latitude — the spherical mean, fixed and stated. */
const METRES_PER_DEGREE_LAT = 111_320;

/** Scale-bar lengths worth drawing, in metres. First one that fits is used. */
const NICE_LENGTHS = [
  100_000, 50_000, 20_000, 10_000, 5000, 2000, 1000, 500, 200, 100,
];

/** Round half away from zero at a fixed number of places — no locale, no drift. */
const fixed = (n, places) => {
  const factor = 10 ** places;
  return String(Math.round(n * factor) / factor);
};

/**
 * Render the stops as an SVG figure.
 *
 * @param {Array<{stop_id: string, name: string, coordinates: {lat: number, lon: number}}>} stops
 * @param {object} strings  the interface strings; no literal text lives here
 * @param {{width?: number, height?: number, pad?: number}} [options]
 * @returns {string} an `<svg>` element, self-contained and free of script
 */
export function renderMap(stops, strings, options = {}) {
  const width = options.width ?? 760;
  const height = options.height ?? 520;
  const pad = options.pad ?? 44;

  if (!Array.isArray(stops) || stops.length === 0) {
    throw new Error('renderMap needs at least one stop with coordinates');
  }

  const lats = stops.map((s) => s.coordinates.lat);
  const lons = stops.map((s) => s.coordinates.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // A degree of longitude is shorter than a degree of latitude everywhere but
  // the equator. Without this the area would be drawn wider than it is.
  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos(midLat * RAD);

  const spanLat = Math.max(maxLat - minLat, 1e-9);
  const spanLon = Math.max((maxLon - minLon) * lonScale, 1e-9);

  const inner = { w: width - 2 * pad, h: height - 2 * pad };
  // One scale for both axes, so the shape of the area is not distorted.
  const unitsPerPixel = Math.max(spanLon / inner.w, spanLat / inner.h);

  const drawnW = spanLon / unitsPerPixel;
  const drawnH = spanLat / unitsPerPixel;
  const offsetX = pad + (inner.w - drawnW) / 2;
  const offsetY = pad + (inner.h - drawnH) / 2;

  const x = (lon) => offsetX + ((lon - minLon) * lonScale) / unitsPerPixel;
  // SVG y grows downward; latitude grows northward. North is up.
  const y = (lat) => offsetY + drawnH - (lat - minLat) / unitsPerPixel;

  /* --- scale bar: the largest nice length that fits a quarter of the width - */
  const metresPerPixel = unitsPerPixel * METRES_PER_DEGREE_LAT;
  const budget = inner.w / 4;
  const barMetres = NICE_LENGTHS.find((m) => m / metresPerPixel <= budget) ?? NICE_LENGTHS.at(-1);
  const barPixels = barMetres / metresPerPixel;
  const barLabel = barMetres >= 1000 ? `${barMetres / 1000} km` : `${barMetres} m`;

  const barX = pad;
  const barY = height - 18;

  /* --- the drawing ------------------------------------------------------- */

  const points = stops.map((stop) => {
    const cx = fixed(x(stop.coordinates.lon), 2);
    const cy = fixed(y(stop.coordinates.lat), 2);
    // The name rides along as a title so a reader can identify a point without
    // the card inventing a label layer. It is the document's value, verbatim.
    return `    <circle cx="${cx}" cy="${cy}" r="3.1"><title>${escapeXml(stop.name)}</title></circle>`;
  }).join('\n');

  const boxX = fixed(offsetX, 2);
  const boxY = fixed(offsetY, 2);
  const boxW = fixed(drawnW, 2);
  const boxH = fixed(drawnH, 2);

  return [
    `<svg class="map" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"`,
    '     xmlns="http://www.w3.org/2000/svg" role="img"',
    `     aria-label="${escapeXml(strings.mapHeading)}">`,
    `  <rect class="map-frame" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}"/>`,
    '',
    `  <g class="map-bounds" aria-label="${escapeXml(strings.mapBoundsLabel)}">`,
    `    <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}"/>`,
    `    <text class="map-coord" x="${boxX}" y="${fixed(offsetY - 8, 2)}">${fixed(maxLat, 5)}°N</text>`,
    `    <text class="map-coord" x="${boxX}" y="${fixed(offsetY + drawnH + 16, 2)}">${fixed(minLat, 5)}°N</text>`,
    `    <text class="map-coord map-coord-right" x="${fixed(offsetX + drawnW, 2)}" y="${fixed(offsetY - 8, 2)}">${fixed(maxLon, 5)}°E</text>`,
    `    <text class="map-coord" x="${boxX}" y="${fixed(offsetY + drawnH + 30, 2)}">${fixed(minLon, 5)}°E</text>`,
    '  </g>',
    '',
    `  <g class="map-points" aria-label="${escapeXml(strings.mapStopsLabel)}">`,
    points,
    '  </g>',
    '',
    `  <g class="map-north" aria-label="${escapeXml(strings.mapNorthLabel)}">`,
    `    <line x1="${width - pad}" y1="${pad + 34}" x2="${width - pad}" y2="${pad - 6}"/>`,
    `    <polygon points="${width - pad},${pad - 12} ${width - pad - 5},${pad - 1} ${width - pad + 5},${pad - 1}"/>`,
    `    <text class="map-label" x="${width - pad}" y="${pad + 48}">N</text>`,
    '  </g>',
    '',
    `  <g class="map-scale" aria-label="${escapeXml(strings.mapScaleLabel)}">`,
    `    <line x1="${barX}" y1="${barY}" x2="${fixed(barX + barPixels, 2)}" y2="${barY}"/>`,
    `    <line x1="${barX}" y1="${barY - 5}" x2="${barX}" y2="${barY + 5}"/>`,
    `    <line x1="${fixed(barX + barPixels, 2)}" y1="${barY - 5}" x2="${fixed(barX + barPixels, 2)}" y2="${barY + 5}"/>`,
    `    <text class="map-label map-label-left" x="${barX}" y="${barY - 10}">${barLabel}</text>`,
    '  </g>',
    '</svg>',
  ].join('\n');
}

/** Escape the five characters that are markup. Nothing else is touched. */
export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
