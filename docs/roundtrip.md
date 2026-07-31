# Roundtrip diff — semantics, fixed before the comparison

This document is written **before** the comparison code exists, and it is not a summary of what
the comparison turned out to do. That order is the whole point: every normalisation below is a
decision that can hide a loss, and a hidden loss is worse than a reported one because nothing
signals its absence. Deciding afterwards — even honestly — means deciding with the result in view.

## What is compared

```
original feed  →  lift  →  MSD document  →  export  →  generated feed
     └────────────────────── diffed against ──────────────────────┘
```

The original is the bundled reference feed, byte-for-byte as published. The generated feed is what
the vendored exporter produces from the document this repository lifts. The diff runs per file and
per field, and reports four things: **matched** · **differed, with both values** · **present only
in the original** · **present only in the generated**.

The classification frame — the seven losses declared in advance and the four cause classes — is
fixed elsewhere and is not restated here, because restating it in the same document that defines
the comparison would invite editing one to fit the other.

---

## The six normalisation decisions

Each states what is normalised, and — the part that matters — **what that normalisation could
hide**.

### 1. Column order is not semantic

A CSV with a header row identifies its fields by name. The comparison matches fields by header
name and never by position.

**What it could hide:** nothing about values, but it does hide *column order itself*. If the
exporter emitted the right fields in an order no consumer expects, this comparison would call it a
match. That is accepted: no GTFS consumer is entitled to rely on column order, and treating it as
semantic would manufacture a difference in every file.

### 2. Row order is not semantic, except where it is

Rows are compared as **sets keyed by each file's identifying columns**:

| File | Key |
|---|---|
| `agency.txt` | `agency_id` |
| `routes.txt` | `route_id` |
| `trips.txt` | `trip_id` |
| `calendar.txt` | `service_id` |
| `calendar_dates.txt` | `service_id` + `date` |
| `stops.txt` | `stop_id` |
| `location_groups.txt` | `location_group_id` |
| `location_group_stops.txt` | `location_group_id` + `stop_id` |
| `booking_rules.txt` | `booking_rule_id` |
| `translations.txt` | `table_name` + `field_name` + `language` + `record_id` + `record_sub_id` + `field_value` |
| `feed_info.txt` | *(single row by specification — compared as the one row)* |

**`stop_times.txt` is the exception and is compared as a sequence.** Its rows are grouped by
`trip_id` and compared in `stop_sequence` order, position by position, because the order of stop
times *is* semantic: it is the order of travel. Saying so explicitly is required, because a
set-comparison here would call a reversed trip a match.

**What it could hide:** a duplicate row. Two identical rows on one side and one on the other
collapse to a match under set semantics. Also, for any file whose key values themselves differ
between the two sides, rows cannot be paired at all — see *What is deliberately not normalised*
below.

### 3. Quoting and escaping are not semantic — the byte level is abandoned here

Both sides are parsed as CSV and **parsed values** are compared, never raw bytes. A field written
`"瑞穂町"` and the same field written `瑞穂町` compare equal; so do `\r\n` and `\n` line endings.

**What this costs, stated plainly:** the comparison can no longer say the two feeds are *byte*
identical, and it never will. Anything that lives only in the bytes — quoting style, line endings,
a UTF-8 BOM, trailing whitespace inside a quoted field that the parser preserves but a
byte-comparison would surface differently — is outside what this diff can see. The byte level was
deliberately given up because the export direction is not a byte-reproduction tool and never
claimed to be; comparing bytes would report a difference on every line and drown the field-level
findings that are the actual subject.

**What it could hide:** an encoding fault that the parser silently repairs. Nothing in the reader
repairs encodings — invalid UTF-8 is reported, not fixed — but the risk belongs on the record.

### 4. Empty string versus absent column is semantic and is **not** normalised away

These are three distinct states and the comparison keeps all three apart:

- the column is present and the value is a non-empty string;
- the column is present and the value is the **empty string** — an assertion that the field is
  known and has no content;
- the column is **absent from the file's header** — no assertion at all.

An empty value on one side against an absent column on the other is reported as a difference, in
both directions.

**Why this one carries the most weight:** the reference feed's `booking_url` is present and empty.
Collapsing empty and absent would erase that distinction, and with it the clearest finding this
build has produced. Omission over invention is a rule about what a document may assert; a diff
that cannot tell "said nothing" from "said nothing is there" cannot check that rule.

**What it could hide:** nothing — this decision is a refusal to normalise. Its cost runs the other
way: it will report differences that a laxer comparison would call equal, and each of those has to
be classified rather than waved through.

### 5. Numeric formatting is not semantic, in numeric fields only

A trailing zero is a formatting difference, not a value difference. Fields are compared
**numerically** where the field is a quantity and **textually** everywhere else. The split is
fixed here, per field, so that it cannot be adjusted later to suit a result:

**Compared numerically** — `stop_lat`, `stop_lon`, `stop_sequence`, `route_type`, `location_type`,
`pickup_type`, `drop_off_type`, `timepoint`, `direction_id`, `exception_type`, `booking_type`,
`prior_notice_duration_min`, `prior_notice_start_day`, and the seven weekday flags of
`calendar.txt` (`monday` … `sunday`).

**Compared textually** — every `*_id` field, every name, every URL, every language and colour
code, and **all dates and times**. A date is the identity of a day and a time is the identity of a
moment; neither is a quantity, and `20241001` compared as a number would silently accept a format
this repository has no reason to accept.

A value that is empty on one side and numeric on the other is a difference, never a zero: empty is
not a number and is not coerced into one.

**What it could hide:** a precision loss. `35.76512` and `35.765120000001` compare unequal, but
`35.7651200` and `35.76512` compare equal — correctly. What it genuinely hides is a *change of
representation* that a consumer might care about, for example an integer written `2` on one side
and `2.0` on the other; both parse to the same number and are reported as a match.

### 6. A file present on one side only is a difference, never a skip

Every file name on either side appears in the report. A file present only in the original is
reported as such, with its row count; so is a file present only in the generated feed. Neither is
skipped, and neither is treated as an empty file on the missing side, because "absent" and "empty"
are the distinction decision 4 exists to preserve.

**What it could hide:** nothing. This is also a refusal to normalise.

---

## What is deliberately **not** normalised, and is referred to the build report

**Identifier alignment across regenerated identifiers.** The export direction regenerates several
identifiers rather than carrying the feed's own. Where it does, the two sides share no key value,
so decision 2 cannot pair the rows at all: every row of such a file is reported as present on one
side only, and no field-level comparison of those rows is possible.

Pairing them would require a seventh normalisation — a mapping that declares which generated
identifier corresponds to which original one. **That normalisation is not added here.** It is
exactly the kind that can hide a loss: once two rows are declared to correspond, every field
difference between them becomes a comparison of "the same thing", and the decision that they were
the same thing was made by the person writing the mapping, not by the data. A mapping invented
while comparing is a mapping chosen to make the comparison come out, even when that is not the
intent.

The consequence is accepted and is the conservative direction: **this diff under-normalises.**
Under-normalising can only manufacture differences, which are then classified and explained; it
cannot hide one. The question of whether such a mapping should exist, and under whose authority,
goes to the build report rather than being settled here.

---

## Determinism

The comparison is pure and takes no clock and no randomness. Running the whole chain twice on the
same input produces byte-identical documents, byte-identical generated feeds and an identical
report — asserted in the test suite, not assumed.

## Why the negative tests exist

A comparison that reports "no differences" means nothing unless it can be shown to *detect*
differences. Before any result of this diff is interpreted, the test suite injects known
differences into the generated side and asserts that each is reported: an empty value against an
absent column and the reverse, a changed name differing only in a full-width character or an
ideographic space, a row present on one side only, a file present on one side only. One test
asserts the opposite — a numerically equal but differently formatted coordinate must **not** be
reported — because a diff that reports everything is as useless as one that reports nothing.

Those tests are the reason to believe the result. They are written before the result is read.

---

# Appendix — recorded after the comparison ran

**Everything above this line predates the run.** This appendix was appended
afterwards and states results and the one operational decision the run forced. Nothing above it
was edited to match what follows; the commit history shows the order.

## Interoperability evidence — the canonical GTFS validator

Both feeds are validated with **MobilityData gtfs-validator v8.0.1**, run by
`scripts/gtfs-validator.mjs` (`npm run check:gtfs`) as a CI step.

### The one network exception

`CLAUDE.md` states that nothing in this repository reaches the network at runtime or in CI. This
step is the single, explicit exception, because the validator is roughly 40 MB and not vendorable
at a sensible size. It holds on three conditions, all enforced in the script:

1. **fetched by pinned version** — `v8.0.1`, never `latest`, never a moving tag;
2. **sha256 verified on every run**, a cached copy included, with the step failing on mismatch —
   an unverified download would make the interoperability claim rest on whatever a server
   returned that day;
3. **the artefact is git-ignored** and never committed.

| | |
|---|---|
| Release | `v8.0.1` |
| Artefact | `gtfs-validator-8.0.1-cli.jar` |
| sha256 | `19293ddd9b6f954f216d4f12054bd8a3232921751c4484339e339764a91000e2` |
| bytes | 40256884 |

### Why the validation date is pinned, and to what

The validator defaults to the **current date** for time-based rules. Left alone, the same input
would produce different output from one day to the next, and a CI result would silently stop
meaning what it meant. Both variable inputs are therefore derived from the feed itself:

- **date** `2026-02-15` — the lifted document's `last_updated`, which comes from the feed's own
  `feed_version` through the documented cascade;
- **country code** `jp` — the lifted document's `provider.country`.

**A different date produces a different notice set**, particularly around calendar coverage. The
date was not chosen to suit the result: the date the feed asserts about itself is the only one
this repository can defend, and the two calendar-related notices below are a consequence of it
rather than something to tune away.

### Results, verbatim

**Original feed** — 12 files, as published. 23 notices, 8 of them ERROR.

| count | severity | code |
|---|---|---|
| 14 | WARNING | `mixed_case_recommended_field` |
| 8 | ERROR | `stop_time_timepoint_without_times` |
| 1 | WARNING | `unexpected_enum_value` |

Stated as a fact about a published feed, and not as a criticism of a publisher: the ERRORs are
`timepoint=1` set on stop times that carry a pickup window instead of an arrival and departure
time — two per row across four rows. The `unexpected_enum_value` is `route_type=715`, the
extended demand-response value. The 14 warnings are 13 stop names and one booking message that
mix scripts within a field.

**Generated feed** — 11 files. 16 notices, **0 of them ERROR**.

| count | severity | code |
|---|---|---|
| 1 | INFO | `future_calendar` |
| 14 | WARNING | `mixed_case_recommended_field` |
| 1 | WARNING | `trip_coverage_not_active_for_next7_days` |

The 14 warnings are the same 13 stop names — `stops.txt` is byte-identical between the two feeds
— plus one on the generated `location_group_name`, which the exporter synthesises by appending an
English literal to the service name. The two calendar notices follow from the pinned validation
date falling one day before the first service day of the derived calendar.

The step fails on an ERROR-severity notice in the generated feed and never on the original's
result.

**The claim under test was zero notices on foreign-derived material. That is not what happened:
the generated feed carries 16.** None is an ERROR, and the largest group is inherited unchanged
from the original — but the number is 16, not 0, and it is recorded here as such.

## Classification of every difference

The frame is the seven losses declared in advance and the four cause classes. **Only
format asymmetry says anything about the description layer's adequacy**; registry narrowness,
exporter design decision and structural constraint of the target format are properties of the
export direction or of GTFS, and are not adequacy findings.

Machine-readable form: `test/fixtures/expected/mizuho.roundtrip.json`, which carries every
difference and every unpaired row with both sides' values.

### Totals

| | |
|---|---|
| files compared | 12 original → 11 generated |
| files on one side only | 1 (`translations.txt`, original) |
| rows paired | 123 |
| rows unpaired | 226 original / 226 generated |
| field differences on paired rows | 11 |

### Files

| # | Difference | Declared | Class |
|---|---|---|---|
| F1 | `translations.txt` present only in the original — 126 rows of romanised labels, not emitted | **V1** | format asymmetry |

### Field differences on paired rows

| # | File · key | Difference | Declared | Class |
|---|---|---|---|---|
| D1 | `agency.txt` · `mizuhomachi` | `agency_phone` `050-2030-2630` → **column absent** | outside | format asymmetry |
| D2 | `routes.txt` · `mizuhomachi_route` | `route_short_name` `瑞穂町デマンド` → `""` | outside | format asymmetry + exporter decision |
| D3 | `routes.txt` · `mizuhomachi_route` | `route_type` `715` → `3` | **V3** | registry narrowness |
| D4 | `routes.txt` · `mizuhomachi_route` | `route_desc` `瑞穂町チョイソコみずほまちデマンドサービス` → **column absent** | outside | format asymmetry |
| D5 | `routes.txt` · `mizuhomachi_route` | `route_color` `008080` → **column absent** | **V2** | format asymmetry |
| D6 | `routes.txt` · `mizuhomachi_route` | `route_text_color` `FFFFFF` → **column absent** | **V2** | format asymmetry |
| D7 | `feed_info.txt` · `#1` | `feed_start_date` `20241001` → `20260215` | **V5** | format asymmetry + exporter decision |
| D8 | `feed_info.txt` · `#1` | `feed_end_date` `20260930` → `20270215` | **V5** | format asymmetry + exporter decision |
| D9 | `feed_info.txt` · `#1` | `feed_version` `20260215` → `msd-0.1.0-20260215` | outside | exporter design decision |
| D10 | `feed_info.txt` · `#1` | `feed_contact_email` `koutuu@town.mizuho.tokyo.jp` → **column absent** | outside | exporter design decision |
| D11 | `feed_info.txt` · `#1` | `feed_contact_url` **column absent** → `https://www.town.mizuho.tokyo.jp/` | outside | exporter design decision |

**D10 is deliberately not filed as format asymmetry.** The document *does* carry the address, as
`provider.contact_email`; the exporter simply does not emit it and emits `feed_contact_url` from
`provider.url` instead. Filing it as format asymmetry would blame the description layer for a
choice the export direction made.

### Column asymmetries on files whose rows could not be paired

| # | File | Difference | Declared | Class |
|---|---|---|---|---|
| D12 | `trips.txt` | `trip_headsign` `瑞穂町全域` — column only in the original | **V7** | format asymmetry |
| D13 | `trips.txt` | `direction_id` `0` — column only in the original | **V7** | format asymmetry |
| D14 | `stop_times.txt` | `timepoint` `1` — column only in the original | **V7** | format asymmetry |
| D15 | `stop_times.txt` | `stop_id`, `location_id` — columns only in the generated feed, both empty on every row | outside | exporter design decision |
| D16 | `booking_rules.txt` | `phone_number` `050-2030-2630` — column only in the original | outside | format asymmetry |
| D17 | `booking_rules.txt` | `prior_notice_start_day`, `prior_notice_start_time` — columns only in the generated feed, both empty | outside | exporter design decision |

### Rows that could not be paired

All 452 unpaired rows come from regenerated identifiers. The diff reports them as present on one
side only because it refuses to invent a mapping between them; the values are in the snapshot.

| # | File | Difference | Declared | Class |
|---|---|---|---|---|
| D18 | `trips.txt` (2+2) | `trip_id` `east_trip`/`west_trip` → `mizuhomachi_route-t0`/`-t1`; `service_id` likewise | **V6** | exporter design decision |
| D19 | `calendar.txt` (2+2) | `service_id` `east_service`/`west_service` → `mizuhomachi_route-oh0`/`-oh1` | **V6** | exporter design decision |
| D20 | `calendar.txt` | `start_date`/`end_date` `20241001`/`20260930` → `20260215`/`20270215` | **V5** | format asymmetry + exporter decision |
| D21 | `calendar_dates.txt` (96+96) | `service_id` regenerated; the `(date, exception_type)` sets are **identical**, 48 per service on both sides | **V6**, anticipated | exporter design decision |
| D22 | `stop_times.txt` (4+4) | `trip_id` regenerated | **V6** | exporter design decision |
| D23 | `stop_times.txt` | `pickup_type`/`drop_off_type` `2`/`1` and `1`/`2` → `2`/`2` on every row | **V4** | structural constraint |
| D24 | `stop_times.txt` | `pickup_booking_rule_id`/`drop_off_booking_rule_id` — set on one side of each row in the original, set on both in the generated feed | outside, follows D23 and D26 | exporter design decision |
| D25 | `stop_times.txt` | `location_group_id` `mizuhomachi_group` → `mizuhomachi_route-area` | outside, follows D27 | exporter design decision |
| D26 | `booking_rules.txt` (1+1) | `booking_rule_id` `general` → `br-default` | outside | exporter design decision |
| D27 | `location_groups.txt` (1+1) | `location_group_id` `mizuhomachi_group` → `mizuhomachi_route-area` | outside | exporter design decision |
| D28 | `location_groups.txt` | `location_group_name` `瑞穂町全乗降場` → `チョイソコみずほまち service area` | outside | format asymmetry + exporter decision |
| D29 | `location_group_stops.txt` (120+120) | unpaired **solely** because `location_group_id` changed; the `stop_id` set is identical | outside, follows D27 | exporter design decision |
| D30 | `booking_rules.txt` | `message` — the feed's free-text booking instructions → `""` | outside | format asymmetry |

**D26 and D27 are outside V6, which names service and trip identifiers.** Booking-rule and
location-group identifiers are regenerated too, and that was not predicted. D29 is the largest
single block of unpaired rows in the report — 240 of 452 — and it is entirely an artefact of D27.

### The seven, one by one

| # | Declared loss | Occurred? |
|---|---|---|
| V1 | translations file not emitted | **yes** — F1, 126 rows |
| V2 | route colour and text colour not emitted | **yes** — D5, D6 |
| V3 | route type collapses to the ordinary bus value | **yes** — D3, `715` → `3` |
| V4 | pickup and drop-off types both set to 2 | **yes** — D23 |
| V5 | calendar range derived from the document date plus one year | **yes** — D7, D8, D20 |
| V6 | service and trip identifiers regenerated | **yes** — D18, D19, D21, D22 |
| V7 | headsign, direction, timepoint, location type not emitted | **partly — see below** |

### A declared loss that did not occur, and why the exception matters

**V7's fourth element, `location_type`, did not occur as predicted.** The column is emitted, and
it matches the original on all 120 stops. The prediction was wrong on its face and is recorded as
a failed prediction.

It would be a mistake to read that as the value surviving. It did not: the MSD document carries no
`location_type` anywhere — an MSD stop holds identity, name and coordinates only, which residual
entry `stop_metadata` records — and the exporter writes the constant `0` for every stop it emits.
The two sides agree because the original happens to be all zeros. A feed with a station or an
entrance would disagree, and the roundtrip would then report a difference that this feed cannot
surface.

This is the clearest instance in the package of a match that means less than it looks like, and it
is why `test/roundtrip.test.js` asserts the constant rather than leaving the point in prose.

### Differences outside the seven — documented candidate or new gap

Adequacy-relevant differences only. The exporter-design ones above say nothing about the
description layer and are excluded here.

| # | Field | Already in the residual register? |
|---|---|---|
| D1 | `agency_phone` | yes — `provider_telephone`, undocumented gap |
| D4 | `route_desc` | yes — `service_description`, undocumented gap |
| D16 | `booking_rules.phone_number` | yes — `booking_phone_number`, documented candidate |
| D30 | `booking_rules.message` | yes — `booking_instructions_free_text`, undocumented gap |
| D28 | `location_group_name` | yes — `location_group_name`, undocumented gap |
| D2 | `route_short_name` | **no — new gap, surfaced by the roundtrip** |

`route_short_name` is the one adequacy-relevant loss the register does not carry. `docs/mapping.md`
records the precedence — `route_long_name` preferred, `route_short_name` a fallback — but nothing
records that the discarded alternative is unrepresentable once the preferred one exists. The value
is preserved in `diagnostics.source.routes`, so nothing is lost silently; what is missing is a
register entry.

### What matched, stated because it is evidence too

- **`stops.txt` is byte-identical between the two feeds** — all 120 rows, including the nine stop
  names carrying U+3000 IDEOGRAPHIC SPACE and the one carrying full-width Latin characters. Names
  are carried verbatim through both directions.
- **The empty `booking_url` survives as empty**, with the column present on both sides. This is the
  case decision 4 exists to protect, and it holds.
- The `(date, exception_type)` set of `calendar_dates.txt` is identical, 96 rows on each side. The
  anticipated fan-out — the document merges exceptions on consensus across merged calendars while
  the export emits one service per operating-hours entry — is 1:1 here rather than an expansion,
  because the merge produced exactly two entries.
- The seven weekday flags match for both services; `booking_type`, `prior_notice_duration_min` and
  `info_url` match; the operating window `09:00:00`–`17:00:00` matches; `agency_id`, `agency_name`,
  `agency_url`, `agency_timezone`, `agency_lang`, `route_id` and `route_long_name` match.
- The `stop_id` set of `location_group_stops.txt` is identical — all 120 memberships survive; only
  the group's identifier changed.

## Provenance, stated with the results

The two directions do not rest on the same kind of artefact. The ingestion side reads a schema
vendored at a **released, citable tag** with a DOI. The export side is vendored from a **default-branch
commit**, because no released commit carries the exporter in pure form. Both are reproducible and
hash-pinned, and the drift check covers both — but they are not citable in the same way, and any
statement resting on the return trip inherits the weaker provenance. `docs/dependency.md` records
the difference in full.
