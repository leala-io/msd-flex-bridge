/**
 * card.test.js — the five properties a machine can check about the card (P3/K.7)
 *
 * What these tests do **not** do is confirm that the card renders. No assertion
 * here opens a browser, lays out a box or measures a colour, and none of them
 * would notice if the page came out unreadable. That is a human check, and it is
 * written down as one: `docs/card.md` carries the smoke-test checklist and the
 * push is conditional on it. This project's earlier map build reached the same
 * conclusion and drew the same line; nothing here claims a rendering gate.
 *
 * What they do check is the part where a quiet mistake would be invisible
 * afterwards — above all that the three states stay three.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { liftFlexToMsd } from '../src/core/lift.js';
import { renderCard, stateFromRegister, formatDate, AXES } from '../src/core/card.js';
import { en, xx } from '../src/core/card-strings.js';
import { buildCard } from '../scripts/build-card.mjs';

const FIXTURE = 'test/fixtures/mizuho/Mizuho_Area-20260202.zip';
const CARD = 'card/index.html';
const STYLESHEET = 'card/card.css';

const bytes = () => new Uint8Array(readFileSync(FIXTURE));
const lifted = await liftFlexToMsd(bytes());
const html = renderCard({ msd: lifted.msd, residuals: lifted.residuals, strings: en });

/** The rendered treatment of one axis: everything that makes it look like itself. */
function treatmentOf(source, axisId) {
  const section = source.match(
    new RegExp(`<section class="(axis axis-[a-z-]+)" data-axis="${axisId}" data-state="([a-z_]+)">([\\s\\S]*?)</section>`),
  );
  assert.ok(section, `the card carries an axis "${axisId}"`);
  const badge = section[3].match(/<p class="state-badge ([a-z- ]+)">([^<]*)<\/p>/);
  assert.ok(badge, `axis "${axisId}" carries a state badge`);
  return {
    containerClass: section[1],
    state: section[2],
    badgeClass: badge[1],
    badgeLabel: badge[2],
  };
}

/* ============ 1. three-state fidelity — the reason this file exists ======== */

test('the three states are three, in the markup and in the stylesheet', () => {
  const present = treatmentOf(html, 'service_area');
  const feedSilent = treatmentOf(html, 'fares');
  const noField = treatmentOf(html, 'rider_eligibility');

  // Every state must differ from every other on every treatment axis. The pair
  // that matters most is feedSilent against noField: one is a statement about a
  // feed, the other a statement about the model, and a reader who cannot tell
  // them apart has been told neither.
  const pairs = [[present, feedSilent], [present, noField], [feedSilent, noField]];
  for (const [a, b] of pairs) {
    assert.notEqual(a.state, b.state);
    assert.notEqual(a.badgeLabel, b.badgeLabel);
    assert.notEqual(a.badgeClass, b.badgeClass);
    assert.notEqual(a.containerClass, b.containerClass);
  }

  assert.equal(feedSilent.state, 'feed_silent');
  assert.equal(noField.state, 'no_field');
});

test('the stylesheet gives the two absent states different treatments, not only different names', () => {
  const css = readFileSync(STYLESHEET, 'utf8');

  const ruleFor = (selector) => {
    const m = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
    assert.ok(m, `the stylesheet declares ${selector}`);
    return m[1].replace(/\s+/g, ' ').trim();
  };

  const feedSilent = ruleFor('.state-feed-silent');
  const noField = ruleFor('.state-no-field');

  assert.notEqual(feedSilent, noField,
    'two classes with identical declarations render identically — the distinction would be invisible');
  // Colour alone is not enough: it disappears in greyscale and for a colour-blind
  // reader. The two must also differ in a non-colour property.
  const nonColour = (rule) => rule.replace(/(color|background)\s*:[^;]*;?/g, '').trim();
  assert.notEqual(nonColour(feedSilent), nonColour(noField),
    'the two states must differ by more than colour');
});

test('an unknown coverage value is refused rather than folded into a known state', () => {
  assert.equal(stateFromRegister({ category: 'x', model_coverage: 'field_exists' }), 'feed_silent');
  assert.equal(stateFromRegister({ category: 'x', model_coverage: 'documented_candidate' }), 'no_field');
  assert.equal(stateFromRegister({ category: 'x', model_coverage: 'undocumented_gap' }), 'no_field');

  assert.throws(
    () => stateFromRegister({ category: 'x', model_coverage: 'something_new' }),
    /has no treatment for/,
    'a new coverage value must stop the build, not quietly join an existing state',
  );
});

test('the state of every absent axis is read from the register, not decided here', () => {
  for (const axis of AXES.filter((a) => a.register)) {
    const entry = lifted.residuals.find((e) => e.category === axis.register);
    assert.ok(entry, `the register carries "${axis.register}"`);
    assert.equal(treatmentOf(html, axis.id).state, stateFromRegister(entry),
      `${axis.id} must show exactly what the register says, with no second derivation`);
  }
});

test('the axis set is fixed in advance and is not reduced to what the feed fills', () => {
  assert.equal(AXES.length, 9);
  for (const axis of AXES) {
    assert.match(html, new RegExp(`data-axis="${axis.id}"`), `${axis.id} is on the card`);
  }
  // Five of the nine carry no value at all. That is the argument, not a failure.
  const absent = AXES.filter((a) => a.register || a.openQuestion);
  assert.equal(absent.length, 5);
});

test('trip purpose is an open question, distinct from the confirmed gaps', () => {
  const tripPurpose = treatmentOf(html, 'trip_purpose');
  const noField = treatmentOf(html, 'rider_eligibility');

  assert.equal(tripPurpose.state, 'open_question');
  assert.notEqual(tripPurpose.badgeLabel, noField.badgeLabel);
  assert.notEqual(tripPurpose.badgeClass, noField.badgeClass);
  assert.equal(lifted.residuals.find((e) => e.category === 'trip_purpose'), undefined,
    'it must not be written into the register: no build needed the field and found none');
});

/* ---------------------------- freshness: a date, not a machine timestamp --- */

test('the freshness date is written out, with the exact stored value kept beside it', () => {
  // It reads as a date to someone skimming, rather than as an identifier.
  assert.match(html, /<time datetime="2026-02-15T00:00:00Z" title="2026-02-15T00:00:00Z">15 February 2026<\/time>/);
  // Nothing is lost: the stored value is on the page in full.
  assert.match(html, /Exact value as stored: <code>2026-02-15T00:00:00Z<\/code>/);

  // And it is where a skimming reader meets it — inside the header, above the
  // introduction, not in a section further down.
  const header = html.match(/<header class="head">([\s\S]*?)<\/header>/);
  assert.ok(header, 'the card has a header');
  assert.match(header[1], /class="freshness"/, 'freshness sits in the header');
  assert.ok(header[1].indexOf('class="freshness"') < header[1].indexOf('class="intro"'),
    'the date comes before the prose, not after it');
});

test('the headline date drops the midnight the source does not state', () => {
  // The rendered text, not the markup: a `datetime` attribute is machine-facing
  // and is exactly where the exact value belongs.
  const headline = html.match(/<p class="freshness-date">([\s\S]*?)<\/p>/)[1]
    .replace(/<[^>]*>/g, '');

  assert.ok(headline.includes('15 February 2026'));
  assert.ok(!headline.includes('00:00:00'),
    'showing midnight would claim a precision the feed does not have');
  // The reason is on the page, not only in the commit message.
  assert.match(html, /midnight is a precision the source does not have/);
});

test('the date is written without a locale API, so it cannot drift between machines', () => {
  assert.equal(formatDate('2026-02-15T00:00:00Z', en), '15 February 2026');
  assert.equal(formatDate('2026-02-15', en), '15 February 2026');
  assert.equal(formatDate('2024-01-01T12:34:56Z', en), '1 January 2024');
  assert.equal(formatDate('2026-12-31', en), '31 December 2026');

  assert.throws(() => formatDate('15.02.2026', en), /not a date this card knows how to write out/);
  assert.throws(() => formatDate('2026-13-01', en), /names no month between 1 and 12/);
});

/* ------------------------- the one value the feed does not state ----------- */

test('provider country is marked as derived and the rule is named', () => {
  assert.match(
    html,
    /<div class="pair pair-derived"><dt>Provider country <span class="tag-derived">Derived<\/span><\/dt><dd>JP<\/dd><\/div>/,
    'the marker sits in the term, so it is visible wherever the value is read',
  );
  assert.match(html, /derived from the timezone the feed gives for its operator/);
  assert.match(html, /a zone outside that table yields no country at all rather than a guess/);

  // No other value on the card carries the marker: the claim is that this is
  // the only derived one, and the card has to keep that claim true.
  assert.equal((html.match(/pair-derived/g) ?? []).length, 1);
});

test('the opening sentence is true of every value on the card', () => {
  assert.match(html, /Exactly one value — the provider country — is derived rather than read/);
  assert.match(html, /Nothing else is computed, completed or guessed/);
  // The old absolute claim must be gone: it was false while an undifferentiated
  // derived value sat among the feed's own.
  assert.ok(!html.includes('Nothing is computed, completed or guessed'));
});

/* ==================== 2. name fidelity — verbatim, or not at all ========== */

test('every stop name appears byte-identically, ideographic spaces included', () => {
  const stops = lifted.msd.services[0].service_area.stops;

  for (const stop of stops) {
    assert.ok(html.includes(stop.name), `the name "${stop.name}" appears exactly as the feed carries it`);
  }

  const ideographic = stops.filter((s) => s.name.includes('　'));
  const fullWidth = stops.filter((s) => /[！-～]/.test(s.name));
  assert.equal(ideographic.length, 9, 'the fixture still carries nine ideographic-space names');
  assert.ok(fullWidth.length > 0, 'the fixture still carries full-width Latin names');
  for (const stop of [...ideographic, ...fullWidth]) {
    assert.ok(html.includes(stop.name));
  }

  // The transformations rule 4a forbids, checked from the other side.
  for (const stop of ideographic) {
    assert.ok(!html.includes(stop.name.replace(/　/g, ' ')), 'no whitespace collapsing');
  }
  for (const stop of fullWidth) {
    assert.ok(!html.includes(stop.name.normalize('NFKC')) || stop.name === stop.name.normalize('NFKC'),
      'no NFKC rewriting of full-width characters');
  }
});

test('no translated value appears anywhere, let alone as a primary label', () => {
  // The feed's translations are diagnostics, not description. The card never
  // reads diagnostics, so none of them can reach it — asserted rather than
  // assumed, because "may appear as a secondary label" is the tempting reading.
  const translations = lifted.diagnostics.translations ?? {};
  const values = JSON.stringify(translations).match(/"[^"]{4,}"/g) ?? [];
  const documentText = JSON.stringify(lifted.msd);

  let checked = 0;
  for (const quoted of values) {
    const value = quoted.slice(1, -1);
    if (documentText.includes(value)) continue;   // also a document value; not a translation artefact
    assert.ok(!html.includes(value), `the translated value "${value}" must not appear on the card`);
    checked += 1;
  }
  assert.ok(checked > 0, 'the fixture still carries translations to check against');
});

/* ========================= 3. no invention ================================ */

test('every value shown traces to the document or to the register', () => {
  // Everything the document could legitimately put on the card: its own values,
  // its arrays joined the one way the card joins them, and its array lengths.
  const allowed = new Set();
  const walk = (node) => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      allowed.add(String(node.length));
      allowed.add(node.join(' '));
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object') { Object.values(node).forEach(walk); return; }
    allowed.add(String(node));
  };
  walk(lifted.msd);

  const shown = [...html.matchAll(/<dd>([^<]*)<\/dd>/g)].map((m) => m[1]);
  assert.ok(shown.length > 0);

  for (const value of shown) {
    assert.ok(allowed.has(value),
      `"${value}" is shown but is not a value the document carries — nothing may be computed, `
      + 'rounded, defaulted or formatted into a range');
  }
});

test('the statements about absent axes are the register’s own words', () => {
  for (const axis of AXES.filter((a) => a.register)) {
    const entry = lifted.residuals.find((e) => e.category === axis.register);
    assert.ok(html.includes(entry.statement),
      `${axis.id} shows the register's statement verbatim, not a paraphrase`);
  }
});

/* ==================== 4. diagnostics separation =========================== */

test('no diagnostics-only value is presented as a fact about the service', () => {
  const documentText = JSON.stringify(lifted.msd);

  // Leaf values only — a key name is not something the card could present as a
  // fact, and matching on keys would fire on ordinary English in the interface.
  const leaves = [];
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') { Object.values(node).forEach(walk); return; }
    if (typeof node === 'string') leaves.push(node);
  };
  walk(lifted.diagnostics);

  const diagnosticValues = [...new Set(leaves)]
    .filter((v) => v.length >= 5)
    .filter((v) => !documentText.includes(v));

  assert.ok(diagnosticValues.length > 0, 'the fixture still carries diagnostics-only values');

  for (const value of diagnosticValues) {
    assert.ok(!html.includes(value),
      `"${value}" is a diagnostics value: it records what the source said or what the lift `
      + 'decided, and is not a description of the service');
  }
});

test('the renderer is never handed the diagnostics at all', () => {
  // Structural, not a matter of care: there is no parameter to leak through.
  const withDiagnostics = renderCard({
    msd: lifted.msd,
    residuals: lifted.residuals,
    strings: en,
    diagnostics: lifted.diagnostics,
  });
  assert.equal(withDiagnostics, html, 'a diagnostics argument changes nothing, because nothing reads it');
});

/* ============================ 5. determinism ============================== */

test('two renders of the same document are byte-identical', () => {
  const again = renderCard({ msd: lifted.msd, residuals: lifted.residuals, strings: en });
  assert.equal(again, html);
});

test('gate: the committed card is exactly what a fresh render produces', async () => {
  const fresh = await buildCard(bytes());
  assert.equal(fresh, readFileSync(CARD, 'utf8'));
});

/* ------------------------------------------------- form and scope guard --- */

test('the card is self-contained: no script, no network, one stylesheet', () => {
  assert.equal(html.match(/<script/gi), null, 'no script of any kind');
  assert.equal((html.match(/<link /g) ?? []).length, 1);
  assert.match(html, /<link rel="stylesheet" href="card\.css">/, 'one stylesheet, by relative path');

  // The only absolute URL permitted is the SVG namespace, which is an identifier
  // and is never fetched.
  const urls = (html.match(/https?:\/\/[^"'\s)]+/g) ?? []).filter((u) => u !== 'http://www.w3.org/2000/svg');
  assert.deepEqual(urls, [], 'nothing is fetched at runtime — no tiles, no fonts, no analytics');
});

test('the service area is drawn from the document’s own coordinates', () => {
  const stops = lifted.msd.services[0].service_area.stops;

  assert.equal(lifted.msd.services[0].service_area.type, 'stops',
    'checked, not assumed: the renderer refuses any other shape');
  assert.equal((html.match(/<circle /g) ?? []).length, stops.length);
  assert.match(html, /class="map-scale"/);
  assert.match(html, /class="map-north"/);
  assert.match(html, /class="map-bounds"/);
});

test('a service area of another shape is refused rather than approximated', () => {
  const zoned = structuredClone(lifted.msd);
  zoned.services[0].service_area = { type: 'zones', zones: [] };

  assert.throws(
    () => renderCard({ msd: zoned, residuals: lifted.residuals, strings: en }),
    /which is a different shape and a stop rather than something to approximate/,
  );
});

test('the interface strings are in one file, with the second language left empty', () => {
  assert.equal(Object.keys(xx).length, 0, 'the second slot stays empty until a review window opens');
  assert.equal(en.lang, 'en');
  assert.ok(Object.keys(en).length > 30, 'the strings really do all live here');
});
