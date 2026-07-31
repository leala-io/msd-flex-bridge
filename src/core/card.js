/**
 * card.js — the service card (P3/K)
 *
 * Evidence, not illustration. The card shows a fixed set of description axes
 * that a legal norm requires, filled from a real published feed — and the axes
 * that stay empty because a discovery format does not carry them. The axis set
 * is decided in advance and is **not** reduced to what this feed happens to
 * fill: the empty axes carry the argument.
 *
 * Pure: no host imports, no wall clock, no randomness. Two renders of one
 * document are byte-identical.
 *
 * ── THE DISTINCTION THIS FILE EXISTS TO PROTECT ─────────────────────────────
 *
 * Three states, three treatments, never merged:
 *
 *   present      the feed carries it, the document carries it
 *   feed_silent  the model HAS the field; this feed leaves it empty
 *                — a statement about one feed
 *   no_field     nothing could carry it, whatever the feed said
 *                — a statement about the model, against our own argument
 *
 * Rendering the last two alike would normalise away the whole point, and it
 * would be as invisible afterwards as conflating "empty" with "absent" would
 * have been in the roundtrip diff. `test/card.test.js` fails if they converge.
 *
 * ── WHERE THE STATE COMES FROM ──────────────────────────────────────────────
 *
 * **Read from the residual register, never re-derived.** The register already
 * carries the distinction as `model_coverage`, decided once, at lift time, with
 * the evidence in hand. Deriving it a second time here would be a second source
 * of truth, free to drift from the first without anything noticing.
 *
 * ── WHAT THE CARD MAY READ ──────────────────────────────────────────────────
 *
 * The document and the residual register. **Not the diagnostics** — those record
 * what the source said and what the lift decided, which is not a description of
 * the service and must never be shown as one. The separation is structural
 * rather than a matter of care: this function is never handed the diagnostics,
 * so no value from them can reach the page. That is also why no translated label
 * appears anywhere on the card, not even as a secondary one.
 */

import { renderMap, escapeXml } from './card-map.js';

/* --------------------------------------------------- register → card state */

/**
 * The register's own vocabulary, mapped to the card's three states.
 *
 * `field_exists` is the only value that means "the model could hold this". The
 * other two both mean the model has no field today; whether a candidate has been
 * written down for a later version is a fact about the register, not about what
 * this feed's reader can rely on.
 */
const STATE_BY_COVERAGE = {
  field_exists: 'feed_silent',
  documented_candidate: 'no_field',
  undocumented_gap: 'no_field',
};

/**
 * @param {{category: string, model_coverage: string}} entry
 * @returns {'feed_silent'|'no_field'}
 * @throws {Error} on a coverage value this card has no treatment for — silence
 *         would collapse an unknown state into a known one, which is the exact
 *         failure this file exists to prevent.
 */
export function stateFromRegister(entry) {
  const state = STATE_BY_COVERAGE[entry?.model_coverage];
  if (state === undefined) {
    throw new Error(
      `residual entry "${entry?.category}" carries model_coverage `
      + `"${entry?.model_coverage}", which the card has no treatment for; `
      + 'add one deliberately rather than letting it fall into an existing state',
    );
  }
  return state;
}

/* ------------------------------------------------------------- the axes --- */

/**
 * The nine axes, fixed in advance.
 *
 * `requiredBy` records which of the independent sources asks for the axis. Only
 * publicly citable groundings are named: the two public sources and the
 * peer-reviewed user research. Axes are never dropped for being empty.
 */
const AXES = [
  { id: 'service_area', requiredBy: 'all four sources' },
  { id: 'operating_hours', requiredBy: 'all four sources' },
  { id: 'booking_rules', requiredBy: 'all four sources' },
  { id: 'response_time', requiredBy: 'legal norm' },
  { id: 'fares', requiredBy: 'three of four sources', register: 'fares' },
  { id: 'capacity', requiredBy: 'legal norm', register: 'vehicles' },
  { id: 'payment_methods', requiredBy: 'user-facing checklist', register: 'payment_methods' },
  { id: 'rider_eligibility', requiredBy: 'legal norm (implicit), user research', register: 'rider_eligibility' },
  { id: 'trip_purpose', requiredBy: 'legal norm only', openQuestion: true },
];

const AXIS_LABELS = {
  service_area: 'Service area',
  operating_hours: 'Operating hours',
  booking_rules: 'Booking rules',
  response_time: 'Response time',
  fares: 'Fares',
  capacity: 'Capacity',
  payment_methods: 'Payment methods',
  rider_eligibility: 'Rider eligibility',
  trip_purpose: 'Trip purpose',
};

/**
 * Why trip purpose is on the card and why it is not a fifth confirmed gap.
 *
 * The norm requires the axis, the feed is silent, and the model has no field —
 * but that was reached by comparing a norm with a schema, not by a build that
 * needed a field and found none. The register therefore has no entry for it, and
 * inventing one would put a claim into the register that no build produced.
 */
const TRIP_PURPOSE_NOTE =
  'The legal norm names this axis; the feed is silent about it; and the description model has no '
  + 'key for it. Unlike the gaps above, this one comes from comparing a norm with a schema rather '
  + 'than from a lift that needed a field and found none — so it is carried here as an open '
  + 'question and is deliberately absent from the residual register.';

/* ------------------------------------------------- values from the document */

/**
 * The values each present axis shows, each one read straight out of the
 * document. No value is computed, rounded, defaulted or formatted into a range;
 * where the document holds two numbers, the card shows two numbers.
 */
function presentValues(axisId, doc, strings) {
  const service = doc.services[0];

  switch (axisId) {
    case 'service_area':
      return [
        { label: strings.areaTypeLabel, value: service.service_area.type },
        { label: strings.stopCountLabel, value: String(service.service_area.stops.length) },
      ];

    case 'operating_hours': {
      const rows = service.operating_hours.default.flatMap((pattern, i) => [
        { label: `${strings.patternLabel} ${i + 1} · ${strings.daysLabel}`, value: pattern.days.join(' ') },
        { label: `${strings.patternLabel} ${i + 1} · ${strings.startLabel}`, value: pattern.start },
        { label: `${strings.patternLabel} ${i + 1} · ${strings.endLabel}`, value: pattern.end },
      ]);
      const exceptions = service.operating_hours.exceptions ?? [];
      if (exceptions.length > 0) {
        rows.push({ label: strings.exceptionsLabel, value: String(exceptions.length) });
      }
      return rows;
    }

    case 'booking_rules':
      return [
        { label: strings.channelsLabel, value: doc.booking_rules.booking_channels.join(' ') },
        { label: strings.noticeLabel, value: String(doc.booking_rules.advance_booking.minimum_minutes) },
      ];

    case 'response_time':
      return [
        { label: strings.noticeLabel, value: String(doc.booking_rules.advance_booking.minimum_minutes) },
      ];

    default:
      throw new Error(`no document values defined for the axis "${axisId}"`);
  }
}

/* ------------------------------------------------------------- rendering -- */

const esc = escapeXml;

const row = (label, value) =>
  `        <div class="pair"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;

function renderAxis(axis, doc, register, strings) {
  const label = AXIS_LABELS[axis.id];

  if (axis.openQuestion) {
    return [
      `      <section class="axis axis-open-question" data-axis="${esc(axis.id)}" data-state="open_question">`,
      `        <h3>${esc(label)}</h3>`,
      `        <p class="axis-source">${esc(strings.sourceColumn)}: ${esc(axis.requiredBy)}</p>`,
      `        <p class="state-badge state-open-question">${esc(strings.stateOpenQuestion)}</p>`,
      `        <p class="axis-statement">${esc(TRIP_PURPOSE_NOTE)}</p>`,
      '      </section>',
    ].join('\n');
  }

  if (!axis.register) {
    const values = presentValues(axis.id, doc, strings);
    const note = axis.id === 'response_time'
      ? `        <p class="axis-note">${esc(strings.responseNote)}</p>`
      : null;
    return [
      `      <section class="axis axis-present" data-axis="${esc(axis.id)}" data-state="present">`,
      `        <h3>${esc(label)}</h3>`,
      `        <p class="axis-source">${esc(strings.sourceColumn)}: ${esc(axis.requiredBy)}</p>`,
      `        <p class="state-badge state-present">${esc(strings.statePresent)}</p>`,
      '        <dl class="values">',
      ...values.map((v) => row(v.label, v.value)),
      '        </dl>',
      note,
      '      </section>',
    ].filter((line) => line !== null).join('\n');
  }

  const entry = register.find((e) => e.category === axis.register);
  if (entry === undefined) {
    throw new Error(
      `the axis "${axis.id}" expects residual register entry "${axis.register}", which is absent; `
      + 'the card reads the register rather than deciding the state itself, so a missing entry is '
      + 'a stop, not something to fill in here',
    );
  }

  const state = stateFromRegister(entry);
  const stateLabel = state === 'feed_silent' ? strings.stateFeedSilent : strings.stateNoField;
  const stateClass = state === 'feed_silent' ? 'state-feed-silent' : 'state-no-field';

  return [
    `      <section class="axis axis-${state.replace('_', '-')}" data-axis="${esc(axis.id)}" data-state="${state}">`,
    `        <h3>${esc(label)}</h3>`,
    `        <p class="axis-source">${esc(strings.sourceColumn)}: ${esc(axis.requiredBy)}</p>`,
    `        <p class="state-badge ${stateClass}">${esc(stateLabel)}</p>`,
    `        <p class="axis-statement">${esc(entry.statement)}</p>`,
    `        <p class="axis-register">${esc(strings.registerLabel)}: <code>${esc(entry.category)}</code> · <code>${esc(entry.model_coverage)}</code></p>`,
    '      </section>',
  ].join('\n');
}

function renderStateKey(strings) {
  const items = [
    ['state-present', strings.statePresent, strings.statePresentHint],
    ['state-feed-silent', strings.stateFeedSilent, strings.stateFeedSilentHint],
    ['state-no-field', strings.stateNoField, strings.stateNoFieldHint],
    ['state-open-question', strings.stateOpenQuestion, strings.stateOpenQuestionHint],
  ];
  return items.map(([cls, label, hint]) => [
    `      <div class="key-item">`,
    `        <span class="state-badge ${cls}">${esc(label)}</span>`,
    `        <p>${esc(hint)}</p>`,
    '      </div>',
  ].join('\n')).join('\n');
}

/**
 * Render the card.
 *
 * @param {{msd: object, residuals: Array<object>, strings: object}} input
 *        `msd` is the lifted document, `residuals` the register produced beside
 *        it. The diagnostics are deliberately not a parameter.
 * @returns {string} a complete HTML document, self-contained apart from one
 *        stylesheet loaded by relative path
 */
export function renderCard({ msd, residuals, strings }) {
  if (!msd || !Array.isArray(residuals) || !strings) {
    throw new TypeError('renderCard requires the document, the residual register and the strings');
  }
  if (!Array.isArray(msd.services) || msd.services.length !== 1) {
    throw new Error('this card describes exactly one service; a multi-service document is a stop');
  }

  const service = msd.services[0];
  const area = service.service_area;
  if (area.type !== 'stops' || !Array.isArray(area.stops) || area.stops.length === 0) {
    throw new Error(
      `this card draws a stops-based service area; the document carries "${area.type}", `
      + 'which is a different shape and a stop rather than something to approximate',
    );
  }

  const provider = msd.provider;

  return [
    '<!DOCTYPE html>',
    `<html lang="${esc(strings.lang)}">`,
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${esc(strings.documentTitle)}</title>`,
    '  <link rel="stylesheet" href="card.css">',
    '</head>',
    '<body>',
    '  <main>',
    '    <header class="head">',
    `      <h1>${esc(strings.title)}</h1>`,
    `      <p class="subtitle">${esc(strings.subtitle)}</p>`,
    `      <p class="intro">${esc(strings.intro)}</p>`,
    '    </header>',
    '',
    '    <section class="freshness">',
    `      <h2>${esc(strings.freshnessHeading)}</h2>`,
    `      <p class="freshness-date"><span class="freshness-label">${esc(strings.freshnessLabel)}</span> <time datetime="${esc(msd.last_updated)}">${esc(msd.last_updated)}</time></p>`,
    `      <p class="note">${esc(strings.freshnessNote)}</p>`,
    '    </section>',
    '',
    '    <section class="service">',
    `      <h2>${esc(strings.serviceHeading)}</h2>`,
    '      <dl class="values">',
    row(strings.providerLabel, provider.name),
    row(strings.serviceLabel, service.name),
    row(strings.serviceTypeLabel, service.service_type),
    row(strings.modeLabel, service.mode),
    row(strings.countryLabel, provider.country),
    row(strings.languagesLabel, provider.languages.join(' ')),
    '      </dl>',
    `      <p class="note">${esc(strings.nameNote)}</p>`,
    '    </section>',
    '',
    '    <section class="state-key">',
    `      <h2>${esc(strings.stateHeading)}</h2>`,
    renderStateKey(strings),
    `      <p class="note">${esc(strings.stateNote)}</p>`,
    '    </section>',
    '',
    '    <section class="axes">',
    `      <h2>${esc(strings.axesHeading)}</h2>`,
    `      <p class="note">${esc(strings.axesNote)}</p>`,
    ...AXES.map((axis) => renderAxis(axis, msd, residuals, strings)),
    `      <p class="note"><span class="freshness-label">${esc(strings.daysLegendLabel)}</span> ${esc(strings.daysLegend)}</p>`,
    '    </section>',
    '',
    '    <section class="area">',
    `      <h2>${esc(strings.mapHeading)}</h2>`,
    `      <p class="note">${esc(strings.mapNote)}</p>`,
    renderMap(area.stops, strings),
    `      <p class="note">${esc(strings.mapAidNote)}</p>`,
    '    </section>',
    '',
    '    <section class="provenance">',
    `      <h2>${esc(strings.provenanceHeading)}</h2>`,
    `      <p class="note">${esc(strings.provenanceNote)}</p>`,
    '    </section>',
    '  </main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

export { AXES, AXIS_LABELS };
