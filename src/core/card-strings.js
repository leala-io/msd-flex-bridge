/**
 * card-strings.js — every interface string the service card uses (P3/K.5)
 *
 * ONE FILE, on purpose. If a review window ever opens, adding a second language
 * is a matter of filling `strings.xx` below and passing it to the renderer; the
 * renderer reads no literal text of its own. Without such a window it stays
 * English, and the empty slot costs nothing.
 *
 * The hard line this file sits on:
 *
 *   **Interface strings live here. Data values never do.**
 *
 * Every service, stop, operator and headsign value on the card comes from the
 * document byte-for-byte — including the ideographic spaces and the full-width
 * Latin characters — and nothing here may substitute for one. Translated labels
 * from a feed's own translations file are *diagnostics*, not description, and
 * the card does not read diagnostics at all; that is why no translation appears
 * on it, not even as a secondary label.
 *
 * Pure data: no host imports, no wall clock, no randomness.
 */

/** English — the only filled slot. */
export const en = {
  lang: 'en',

  documentTitle: 'Service description card',
  title: 'Service description card',
  subtitle: 'What a description layer carries, and what a discovery format cannot.',

  intro:
    'Every value below is read from a description document lifted out of a published, openly '
    + 'licensed feed, or from the residual register produced alongside it. Exactly one value — the '
    + 'provider country — is derived rather than read, and is marked where it appears. Nothing else '
    + 'is computed, completed or guessed. The axes that stay empty are the point of this card, not '
    + 'a shortfall in it.',

  /** Month names, so a date can be written unambiguously without a locale API. */
  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],

  /* --- the three states, and the qualifier that is not a fourth state ----- */

  stateHeading: 'How to read the three states',
  stateNote:
    'The second and the third are different statements and are never shown alike. Merging them '
    + 'would hide the only thing this card exists to show.',

  statePresent: 'Present',
  statePresentHint: 'The feed carries it and the document carries it.',

  stateFeedSilent: 'The feed does not say',
  stateFeedSilentHint:
    'The description model has a field for it. This publisher’s feed leaves it empty. '
    + 'A statement about one feed.',

  stateNoField: 'The model has no field',
  stateNoFieldHint:
    'Nothing could carry it, whatever the feed said. A statement about the description model, '
    + 'and one that runs against this project’s own argument.',

  stateOpenQuestion: 'Open question',
  stateOpenQuestionHint:
    'Required by the legal norm, absent from the feed, and with no field in the model — but '
    + 'reached by comparing a norm with a schema, not by a build that needed a field and found '
    + 'none. It is recorded here as a question, not as a confirmed gap.',

  /* --- sections ----------------------------------------------------------- */

  serviceHeading: 'The service',
  providerLabel: 'Operator',
  serviceLabel: 'Service',
  serviceTypeLabel: 'Service type',
  modeLabel: 'Mode',
  countryLabel: 'Provider country',
  languagesLabel: 'Provider languages',
  derivedTag: 'Derived',
  countryDerivation:
    'Provider country is the one value on this card that the feed does not state: it is derived '
    + 'from the timezone the feed gives for its operator, through an explicit table of zones whose '
    + 'country is unambiguous, and a zone outside that table yields no country at all rather than '
    + 'a guess.',
  nameNote: 'Names are shown exactly as the feed carries them, byte for byte, and are not transliterated.',

  freshnessHeading: 'Freshness',
  freshnessLabel: 'The feed’s own date',
  freshnessExactLabel: 'Exact value as stored',
  freshnessTimeNote:
    'The date is the one the feed states about itself. The stored value carries a midnight time '
    + 'that the feed does not: the derivation appends it to satisfy a timestamp format. It is kept '
    + 'above so nothing is lost, and it is not shown as the headline date, because midnight is a '
    + 'precision the source does not have.',
  freshnessNote:
    'No ground truth is compared against this date in this card, so no second date is shown; where '
    + 'one exists, both dates belong here. Staleness is a property of published open data, not '
    + 'something to hide.',

  axesHeading: 'Description axes',
  axesNote:
    'Nine axes, taken from the intersection of four independent sources plus the axes only the '
    + 'legal norm adds. The set is fixed in advance and is not reduced to what this feed happens '
    + 'to fill.',
  axisColumn: 'Axis',
  sourceColumn: 'Required by',
  stateColumn: 'State',

  mapHeading: 'Service area',
  mapNote:
    'Points, extent and scale come from the coordinates the document carries. There is no '
    + 'backdrop: a basemap would need tiles fetched at runtime, and this repository makes no '
    + 'network calls. What the area has to show — where it is, how far it reaches, how densely '
    + 'it is served — is carried by the points themselves.',
  mapScaleLabel: 'Scale bar',
  mapNorthLabel: 'North',
  mapBoundsLabel: 'Bounding box',
  mapStopsLabel: 'Stops',
  mapAidNote:
    'The scale bar and the bounding box are drawing aids computed from the coordinates. They are '
    + 'not values the feed states.',

  provenanceHeading: 'Where this comes from',
  provenanceNote:
    'The document is lifted from the published feed by this repository’s bridge; the residual '
    + 'register is produced in the same run and records what neither the feed nor the model could '
    + 'carry. The card reads those two and nothing else. In particular it does not read the '
    + 'diagnostics, which record what the source said and what the lift decided — those are not '
    + 'a description of the service and are never shown here as one.',

  registerLabel: 'Residual register entry',
  valueUnavailable: '—',

  daysLegendLabel: 'Day codes',
  daysLegend: 'mo Monday · tu Tuesday · we Wednesday · th Thursday · fr Friday · sa Saturday · su Sunday',
  daysLabel: 'Days',
  startLabel: 'From',
  endLabel: 'Until',
  patternLabel: 'Pattern',
  exceptionsLabel: 'Dated exceptions',
  channelsLabel: 'Booking channels',
  noticeLabel: 'Minimum advance notice, in minutes',
  areaTypeLabel: 'Service area kind',
  stopCountLabel: 'Stops carrying coordinates',
  responseNote: 'The same field the booking axis reads; the norm counts it as a separate axis.',
};

/**
 * Second language — deliberately empty.
 *
 * Filling this object and handing it to the renderer is the whole upgrade. It
 * is left here rather than removed so that the cost of the decision stays
 * visible: nobody has to find out where the strings live first.
 */
export const xx = {};

export default en;
