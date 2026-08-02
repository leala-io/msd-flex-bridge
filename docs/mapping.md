# Directional mapping — GTFS-Flex → MSD (P1.0b derivation)

This document is the **directional inverse** of the upstream adapter mapping. Upstream
`engine/adapters/gtfs-flex/README.md` (at commit `0e79571fb7e3a66a8e351261318c853f9f8f051c`)
documents the **MSD → GTFS-Flex** direction in a spec-verified table with three deviations and a
loss list. The bridge goes the other way — **GTFS-Flex → MSD** — so the mapping here is derived by
inverting that table and reconciling it with the MSD schema v0.1.0 (release v0.1.1), Conventions
C1/C2, and the project rules that cannot be derived from either side — the `last_updated` cascade, the
calendar merge, omission over invention, names verbatim and the two-edge fence. Those five are stated
in full in §"Non-negotiable rules applied in this direction" below.

**Status:** derivation for review. No lift code exists yet. This is a document.

The MSD target is **schema v0.1.0** (as published in release v0.1.1). Emitted `msd_version` is the
string `"0.1.0"`.

---

## How to read this document

Each row is **one GTFS-Flex field**, with its MSD target, the transformation, and its
**disposition**:

- **direct** — value carried through unchanged (no normalisation; see "Names verbatim").
- **derived** — computed by a stated deterministic rule.
- **diagnostic only** — captured into `diagnostics`, **not** written into the MSD file.
- **not represented** — no MSD target; recorded as a residual with its class:
  - **(a) format gap** — MSD v0.1.0 structurally cannot express it.
  - **(b) feed omission** — the field could be expressed, but this feed does not carry it.
  - **(c) conversion / staleness** — meaning is lost or degraded in the direction of travel.

For every row the derivation states whether the inverse is **unambiguous** or whether a **choice**
was made. The choices are the point of the review — §"Choices made" collects them.

A row usually carries exactly one disposition. Three carry a **compound** one, because the field has
two fates at once, and both must be visible: `agency_timezone` (**derived + diagnostic** — it sets
`provider.country` through the explicit table *and* its own value is recorded), `route_type`
(**diagnostic only + fence input** — it decides acceptance without being written), and
`booking_rules.phone_number` (**derived + not represented (a)** — its presence yields the `phone`
channel while the number string itself has no MSD field). A compound disposition is a statement about
the field, never a licence to choose one fate at implementation time.

A field being "not represented" and also "captured in diagnostics" is not a contradiction: the
residual class records the loss; the diagnostic preserves the bytes so nothing is dropped silently.

---

## Where the diagnostics and residuals live

The lift returns three values — `liftFlexToMsd(files) → { msd, residuals, diagnostics }`, implemented
in `src/core/lift.js`. They are **siblings**: `msd` is the document that is serialised and validated;
`residuals` and `diagnostics` travel alongside it and are **never keys inside it**. Every
`diagnostics.…` path in this document is therefore a path into that sibling object, not into the MSD
file — the same for the residual entries collected in §"Not represented".

This matters more than a naming convention. The MSD schema is deliberately **open**:
`additionalProperties` is not set to `false` (stated in the schema's own description at
`vendor/msd/schema/v0.1.0/msd.schema.json`), so a stray `diagnostics` key inside the document would
**validate silently** — the validator would report success on a file carrying material that must not be
there. Schema validity therefore cannot be the test for this. An **acceptance test must assert the
absence** of `diagnostics` (and of any residual container) from the emitted document directly.

---

## Upstream spec deviations respected

The forward document flags three deviations from its own specification table, verified against the
live GTFS reference. The inverse honours each:

1. **`maximum_days` ↔ `prior_notice_start_day`** (not `prior_notice_last_day`). MSD
   `advance_booking.maximum_days` is the booking *horizon* — the earliest day you may book — which is
   GTFS `prior_notice_start_day`. So the inverse reads `maximum_days` **from** `prior_notice_start_day`,
   and treats `prior_notice_last_day` (the *latest* day, GTFS-required for `booking_type=2` only) as
   **not represented**.
2. **Booking link fields are `pickup_booking_rule_id` / `drop_off_booking_rule_id`**, not a single
   `booking_rule_id` on `stop_times`. The inverse follows both link fields to the `booking_rules` row.
3. **Stops are modelled as a location group** (`location_groups` + `location_group_stops` +
   `stops.txt`), not a bare stop list. The inverse reads the group membership to build
   `service_area.type = "stops"`.

---

## Non-negotiable rules applied in this direction

- **`last_updated` cascade**, first match wins — never the system clock:
  1. `feed_info.feed_version` when it parses as `YYYYMMDD` → `YYYY-MM-DDT00:00:00Z`.
  2. `feed_info.feed_start_date` → `…T00:00:00Z`.
  3. earliest `calendar.start_date` → `…T00:00:00Z`.
  4. otherwise **refuse** with a named reason.
  Every level from 2 on records `diagnostics.provenance.last_updated = { level, source_field, value }`
  **and** emits a residual entry stating the publisher declares no document freshness of its own.
- **Calendar merge, scoped to one service.** Several calendars belonging to **one route and its
  location group** become several `operating_hours.default[]` entries of **that route's** service — the
  feed states one offer with several day patterns. The merge is bounded by the route: two routes with
  distinct calendars are **two** entries in `services[]` and are never merged (see §`routes.txt`, "One
  route, one service"). Mandatory `calendar_merge` is recorded **per service**, at
  `diagnostics.services[<service_id>].calendar_merge`, and records how many calendars were merged into
  it, their original `service_id` values verbatim, and that the feed gives no reason for the
  separation.
  The merge extends to the **exceptions**: the merged service has one set of closure days, written on
  consensus across the merged calendars and never one entry per source row (see §`calendar_dates.txt`).
  *Rationale (kept here by requirement):* the merged reading asserts the service runs on the **union**
  of all days. Where separate calendars encode a rider-side distinction the format cannot express —
  residence-based usage days, membership cohorts — that union is individually wrong for every rider,
  while the feed itself stays byte-identical. Making the merge visible is the point; performing it
  silently would reproduce exactly the defect the residual report exists to expose. This is a
  **modelling choice**, not a derivation.
  *Why the route bound matters:* merging calendars **across** routes would erase a distinction the feed
  makes structurally — one route per district, each with its own location group — and is the mirror
  image of the defect the within-route merge already guards against. The within-route merge collapses a
  distinction the format cannot express; a cross-route merge would collapse one it expresses plainly.
- **Omission over invention (C1).** Where the feed carries nothing, the MSD key is **absent** — never
  `null`, `0`, `false`, `[]`. Each omission produces a residual entry.
- **Names verbatim.** Service, stop, operator and headsign values are carried byte-for-byte:
  no `.normalize()`, no `/\s+/` collapsing, no case folding, no transliteration, no substitution from
  `translations.txt`. `trim()` on outer edges only. `translations.txt` values become secondary labels
  in `diagnostics.translations` and are **never** written into the MSD file.
- **Fence, two edges.** Accept only feeds that (a) express flex via `location_groups` +
  `location_group_stops` **without** `locations.geojson`, and (b) carry `routes.route_type` in
  `{3, 715}`. Anything else is **refused with a named reason**, never coerced. Registry `mode` v0.1.0
  permits only `bus`, so an unsupported route type is not expressible.
  **The fence is applied to the feed, not to each route.** Every route must clear edge (b), and every
  route must reach a location group through the join in §`routes.txt`. A feed that mixes a conforming
  flex route with a non-conforming one — an ordinary bus route, or a route with no location group — is
  **refused whole**, with the offending `route_id` named in the reason. It is not of the accepted kind,
  and skipping the non-conforming routes would emit a document that looks complete while showing a
  partial picture of the offering. This is the same failure the one-route-one-service rule exists to
  prevent, reached from the other side.

### Classification and refusal codes

Detection returns exactly one of these. Every refusal is a structured value carrying a one-sentence
reason **and** the evidence — the file or field that was present or absent, and any offending value
verbatim — never a thrown exception and never console output. The codes are the contract between this
document and `src/core/detect.js`; the two must agree.

| Outcome | Code | Fired by |
|---|---|---|
| accepted | — (`kind: "location_group"`) | Both fence edges clear, every route reaching exactly one location group. |
| refused | `geojson_zone_kind` | `locations.geojson` present, or `stop_times.location_id` populated — fence edge (a). |
| refused | `not_flex` | Neither `location_groups.txt` nor `location_group_stops.txt` present: ordinary scheduled GTFS. |
| refused | `mixed_route_kinds` | A route reaches no location group through `trips` → `stop_times`, so the feed carries flex and non-flex routes together. |
| refused | `unsupported_route_type` | A `route_type` outside `{3, 715}` — fence edge (b). |
| refused | `multi_group_route` | One route referencing more than one location group. |
| refused | `divergent_booking_rules` | Several routes whose booking-rule union or `info_url` differ (Finding 3). |
| refused | `exception_only_calendar` | `calendar.txt` absent, or present with no data rows, while `calendar_dates.txt` carries at least one row — fence edge (c). |
| refused | `unrecognised` | Not a GTFS feed at all: no readable files, or `agency.txt`/`routes.txt` absent, or `routes.txt` carrying no data rows. |

`mixed_route_kinds` is deliberately distinct from `not_flex`. Such a feed **is** flex, in part — saying
it is "not flex" would misdescribe it to the publisher, who can see the flex route in their own data.
The distinction is about what the reader is told, not about what is refused: both are refused whole.

**Fence edge (c) — why an exception-only calendar is refused rather than flagged.** A feed may state
its service days entirely through dated exceptions, with no weekly calendar at all. Until this edge
existed such a feed was accepted, and it lifted into a document with almost no operating hours:
schema-valid, because operating hours are not a required property, and nearly empty in substance.
A document that is valid and nearly empty is exactly the failure the fence exists to prevent, and it
is the more dangerous kind because nothing about it looks wrong. The other seven codes refuse rather
than emit a partial picture; this one is consistent with them.

The check runs **last**, after everything that establishes the feed is of the accepted kind. That
ordering is deliberate: it is only worth telling a publisher that their service days are exception-only
once the feed is otherwise one this bridge could have lifted. The evidence carries both the service
identifiers the exceptions reference and those the routes actually use, so a reader can see at once
whether the two even agree.

A weekly calendar **with** dated exceptions is the ordinary shape and stays accepted — that is the
case the bundled feed has, and a test asserts the edge does not swallow it.

#### Lift-scoped refusals

The table above is **detection-scoped**: those codes are decided before any lifting begins. One
refusal happens later, in the lift, because it depends on content detection does not inspect. Every
refusal code in the project appears in one of these two tables.

| Code | Fired by |
|---|---|
| `no_document_freshness` | The `last_updated` cascade reaches level 4: `feed_version` does not parse as `YYYYMMDD`, `feed_start_date` is absent, and no calendar carries a `start_date`. The evidence names all three. |

**The lift's contract on a refused feed** — from either table — is `{ msd: null, residuals: [], diagnostics, refusal }`:
the document is `null` rather than partial, no residual report is produced for a document that does
not exist, the diagnostics gathered so far are still returned, and the refusal is the structured value
detection produced, passed through unchanged. **Never a thrown exception**, in keeping with the rule
that refusals are values.

---

## Mapping by source file

### `agency.txt` → `provider`

| Source field | MSD target | Transformation | Disposition |
|---|---|---|---|
| `agency_id` | `provider.provider_id` | Carried verbatim when present. | **direct** — unambiguous when present; **choice** when absent (see slug rule below). |
| `agency_name` | `provider.name` | Verbatim, no normalisation. | **direct** — unambiguous. |
| `agency_url` | `provider.url` | Verbatim URI. | **direct** — unambiguous. |
| `agency_lang` | `provider.languages[0]` | `languages = [agency_lang]` when present. | **derived** — unambiguous rule; **choice** in that MSD `languages[]` is a list and one agency language yields a single-element array. |
| `agency_timezone` | `provider.country` | IANA zone looked up in an **explicit table** of unambiguous zone→ISO-3166-1-alpha-2 mappings; a zone not in the table yields no `country`. The zone itself is also recorded as `diagnostics.provenance.timezone`. | **derived** (via explicit table) **+ diagnostic** — **choice** (see below). |
| `agency_phone` | — | No provider telephone field exists in MSD v0.1.0; captured to `diagnostics`. | **not represented (a)** — **choice / finding** (see §Findings). |
| `agency_email` | `provider.contact_email` | Verbatim email, when present. | **direct** — unambiguous. |
| `agency_fare_url`, other columns | — | Captured to `diagnostics`. | **not represented (a/b)** — unambiguous. |

- **`provider_id` when `agency_id` is absent (choice).** GTFS makes `agency_id` conditionally optional
  (a single-agency feed may omit it). MSD requires `provider_id`. Rule: use `agency_id` verbatim if
  present; otherwise a **deterministic slug of `agency_name`**. Lowercased ASCII is *not* safe here —
  names are non-Latin — so the slug is byte-derived, and this is the rule rather than any particular
  result:

  > **FNV-1a (32-bit) over the UTF-8 bytes of `agency_name`, rendered lower-case hexadecimal, padded
  > to eight digits, prefixed `agency-`.** For example a name hashing to `0x1f3a02bc` yields
  > `agency-1f3a02bc`.

  It is pure, deterministic across runs and platforms, independent of locale and of Unicode
  normalisation, and it never inspects the characters of the name — only its bytes. It is **not** a
  checksum for integrity and carries no meaning beyond identity; collisions are possible in principle
  and would be a finding, not a silent merge. Whenever the slug is used, provenance is recorded at
  `diagnostics.provenance.provider_id`. This is a **choice** because MSD needs an id the feed did not
  supply. **Unexercised by the bundled feed**, which carries `agency_id` — see §"Rules not exercised
  by the bundled fixture".
- **`agency_timezone` → `provider.country` (choice).** The forward map *derives* `agency_timezone` from
  `provider.country` via a country→IANA table, calling it an assumption. The inverse is **not** a general
  function — many countries share a zone, and no attempt is made to write one. **Choice:** invert only
  through an **explicit table**, and omit otherwise. Concretely:
  - A short, documented table maps IANA zone → ISO 3166-1 alpha-2 code and contains **only** zones whose
    country attribution is unambiguous. It is the mirror of the country→IANA table the forward direction
    uses, and equally an assumption made visible rather than hidden. The table lives in the code as data;
    every entry is listed here.

    | IANA zone | ISO country |
    |---|---|
    | `Asia/Tokyo` | `JP` |
    | `Europe/Zurich` | `CH` |
    | `Africa/Kampala` | `UG` |

    These are the zones this project has actual material for. Extending the table is a data change, not
    a rule change.
  - A zone **not** in the table yields **no** `provider.country` — omission over invention (C1). It is
    not guessed, not derived from a prefix (`Asia/…`), not inferred from `agency_lang`.
  - Whenever `country` is set this way, record
    `diagnostics.provenance.country = { source_field: "agency_timezone", value: <zone>, rule: "explicit zone→country table" }`
    — the same shape used for `last_updated` provenance.
  - `provider.country` is **optional** in MSD v0.1.0 (`provider` requires only `provider_id` and `name`),
    so an unmapped zone never blocks a valid file.

  Whether the export direction should invert timezone and country at all is a matter for a later package
  and is **not** decided here: that direction aborts on an unmapped country either way, and an omitted
  `country` merely moves the abort one step earlier.

### `routes.txt` → one `services[]` entry per route + fence

This section maps **per route**. Every route in `routes.txt` produces its own entry in `services[]`; the
table below is applied once for each. There is no per-route skipping — the fence has already refused the
whole feed if any route fails it (see §"Non-negotiable rules", fence).

| Source field | MSD target | Transformation | Disposition |
|---|---|---|---|
| `route_id` | `services[i].service_id` | Verbatim. | **direct** — unambiguous. |
| `agency_id` | — | Consistency link to `provider`; not re-written. | **diagnostic only** — unambiguous. |
| `route_long_name` | `services[i].name` | Verbatim; preferred over `route_short_name`. | **derived** — **choice** (long vs short precedence). |
| `route_short_name` | `services[i].name` | Fallback when `route_long_name` is empty. | **derived** — **choice** (fallback order). |
| `route_desc` | — | No `service.description` field in MSD v0.1.0; captured to `diagnostics`. | **not represented (a)** — **finding** (see §Findings). |
| `route_type` | `services[i].mode` (indirectly) | Value in `{3, 715}` gates the fence; `mode` is set to the constant `"bus"`. The literal value is recorded in `diagnostics`. | **diagnostic only** + fence input — **choice** (both 3 and 715 collapse to `bus`). |
| `route_color`, `route_text_color` | — | Recorded in `diagnostics`. | **diagnostic only** — unambiguous. |
| `route_url` | — | Recorded in `diagnostics`. | **diagnostic only** — unambiguous. |
| `route_sort_order`, `continuous_pickup`, `continuous_drop_off`, `network_id`, other columns | — | Presentation order, continuous-stopping flags and network grouping have no MSD target; captured verbatim to `diagnostics`. | **not represented (a/b)** — unambiguous. |

- **One route, one service (rule).** A location-group flex feed may carry **several** routes — one per
  district, say — each with its own location group and its own calendars. Such a feed passes both fence
  edges, so the mapping must handle it: **one route, together with its location group and its calendars,
  becomes one entry in `services[]`.** MSD models `services` as an array (`minItems: 1`); nothing in the
  schema forces a single service. For a single-route feed the result is unchanged. Taking the first route
  and discarding the rest would fail silently — the output would look valid while omitting most of the
  offering.
- **Document-level `booking_rules` and `references` across several routes (P1 rule).** MSD holds both at
  document level, one each per file (§Findings 3). Where a feed carries several routes, they are written
  **only if every route references the same `booking_rule_id` and the same `info_url`** — then the single
  document-level object states what every service states, and asserts nothing extra. Where the routes
  diverge, the feed is **refused with a named reason** (`routes carry divergent booking rules`) and the
  divergence is recorded as a residual entry. One route's rule is **never** written document-wide, and
  divergent rules are **never** merged: the first asserts for every service something only one route
  says, the second asserts something no route says. A single-route feed is unaffected — there is nothing
  to diverge from. This rule fixes how P1 behaves in the presence of Finding 3; it does not resolve the
  gap, which stands as recorded.
- **Per-service constants.** `services[i].mode = "bus"` and `services[i].service_type = "on_demand"` are
  constants — the only permitted registry values at v0.1.0 (see §"MSD-required fields with no direct
  source field"). `route_type`
  decides acceptance, not the emitted mode.

### `trips.txt` → structural linkage

| Source field | MSD target | Transformation | Disposition |
|---|---|---|---|
| `trip_id` | — | Structural key joining `stop_times` to a route/calendar. | **diagnostic only** — unambiguous. |
| `route_id` | — | Links the trip to its route, and thereby to **the service that route became**. This is the join that keeps calendars, windows and location groups attached to the right `services[]` entry. | **diagnostic only** — unambiguous. |
| `service_id` | — | Joins the trip to `calendar` / `calendar_dates`; the value is preserved verbatim in that service's `diagnostics.calendar_merge`. | **diagnostic only** — unambiguous. |
| `trip_headsign`, other columns | — | Verbatim into `diagnostics` (names never normalised). | **diagnostic only** — unambiguous. |

`trips.txt` carries no rider-facing content that MSD models; it is consumed to connect calendars and
stop_time windows to the service its route produced. Nothing from it is written into the MSD file.

### `calendar.txt` → `services[i].operating_hours.default[]` (with per-service merge)

| Source field | MSD target | Transformation | Disposition |
|---|---|---|---|
| `service_id` | `diagnostics.services[<service_id>].calendar_merge.merged[]` | Preserved verbatim as an original calendar id, under the service whose route the calendar belongs to — the merge record is per service, **keyed by `service_id`** rather than by array index, since an index into a document the reader must cross-reference is fragile. | **diagnostic only** — unambiguous. |
| `monday`…`sunday` | `services[i].operating_hours.default[j].days` | For each calendar, `days` = the tokens `mo tu we th fr sa su` whose flag is `1`, in that fixed week order (see day-token note). | **derived** — unambiguous rule; the *merge into one service* is a **choice** (see calendar-merge rule). |
| `start_date` | `last_updated` (cascade level 3) | Earliest `start_date` across **all** calendars in the feed → `YYYY-MM-DDT00:00:00Z`, only if levels 1–2 did not fire. `last_updated` is a document-level field, so this level is not scoped per service. | **derived** — unambiguous within the cascade. |
| `start_date` / `end_date` (as a range) | — | MSD has no service-calendar date range. | **not represented (c)** — unambiguous. |

- **Day tokens are `mo tu we th fr sa su`.** Lowercase, two letters, Monday first. The MSD schema types
  `operating_hours.default[].days` as an unconstrained array of strings and no registry covers it, so the
  vocabulary is not enforced by validation and must be fixed here or it will be fixed silently in code.
  It is taken from the **canonical MSD reference example**, which is the only attestation of the intended
  form; that example is not vendored in this repository, so the tokens are recorded here rather than
  verifiable from `vendor/`.
- **Which calendars belong to which service.** A calendar reaches a service through
  `calendar.service_id` ← `trips.service_id` → `trips.route_id` → that route's `services[]` entry. Only
  the calendars reached this way are merged into that service's `operating_hours.default[]`.
- **Hours come from `stop_times`, not `calendar`.** `calendar.txt` supplies only the **day pattern**.
  The `start`/`end` clock times of an `operating_hours.default[]` entry come from the flex pickup window
  in the `stop_times.txt` rows of **its own** trip (below) — not from a single service-wide window. One
  default entry is emitted per merged calendar, pairing that calendar's day array with the window of the
  trips running on it.

### `calendar_dates.txt` → `services[i].operating_hours.exceptions[]`

| Source field | MSD target | Transformation | Disposition |
|---|---|---|---|
| `service_id` | — | Joins the exception to the (merged) service, by the same route link as `calendar.txt`, and decides consensus (see below). | **diagnostic only** — unambiguous. |
| `date` | `operating_hours.exceptions[].date` | `YYYYMMDD` → `YYYY-MM-DD`. One entry per **date**, not per row; dates are emitted in ascending order. | **derived** — unambiguous (pure reformat). |
| `exception_type` | `operating_hours.exceptions[].closed` | `2` → `closed: true`, `1` (added service) → `closed: false`, **only on consensus across the merged calendars**. | **derived** — **choice** (consensus rule and the representation of `exception_type = 1`; see below). |

- **Exceptions merge on consensus (rule).** The calendars of a route have already become **one**
  service with several `default[]` entries. Carrying the exceptions per calendar would perform that
  merge only halfway: the service is one, so its closure days are one set too. Emitting one entry per
  source row is not merely untidy — it is semantically redundant, and a reader cannot tell redundancy
  from a genuine double statement. Per date, across the calendars merged into the service:
  - **Every merged calendar removes it** → **one** entry, `closed: true`.
  - **Every merged calendar adds it** (`exception_type = 1`) → **one** entry, `closed: false`.
  - **Some but not all** → **no entry at all.** The service still runs that day, for the riders of the
    calendars that did not remove it, so `closed: true` would be plainly false. The date is recorded
    in `diagnostics.services[<service_id>].exception_consensus` — naming the date and which calendars
    removed it, added it and were silent — and as a class **(a)** residual: a calendar-selective
    closure cannot be expressed once several calendars are one service. **Two conflicting entries for
    one date are never emitted**: the schema permits them and no consumer could resolve them.

  The consensus condition is the rule, not a footnote to it. Where a service has a single calendar,
  consensus is trivially met and the rule is invisible. In the bundled fixture all 48 dates are
  removed by both calendars, so the document carries 48 entries where the feed has 96 rows; the
  partial branch is exercised by `test/fixtures/synthetic/partial-exception/`.

  *Denominator:* the calendars merged into the service — the same set `calendar_merge` records. A feed
  that states its service days only through `calendar_dates.txt`, with no `calendar.txt` rows to
  merge, uses the calendars named by the exception rows themselves.

- **`exception_type = 1` (choice).** GTFS `1` means "service added on this date". MSD exceptions model
  deviations from the default hours. Rule: `2` → `closed: true`; `1` → an entry with `closed: false`
  (an added operating date), subject to the same consensus condition. Where an added date's hours are
  not otherwise stated, the entry carries the date and `closed: false` and **omits** `start`/`end`
  rather than inventing a window (C1). This is a choice because MSD does not distinguish "added" from
  "modified". **This rule is derived from the
  specification and is not exercised by the bundled fixture** — see §"Rules not exercised by the bundled
  fixture".

### `stops.txt` → `services[i].service_area.stops[]`

| Source field | MSD target | Transformation | Disposition |
|---|---|---|---|
| `stop_id` | `services[i].service_area.stops[].stop_id` | Verbatim. | **direct** — unambiguous. |
| `stop_name` | `services[i].service_area.stops[].name` | **Verbatim** — U+3000 IDEOGRAPHIC SPACE and fullwidth Latin preserved; no normalisation. | **direct** — unambiguous. |
| `tts_stop_name` | — | Pronunciation form of `stop_name`. Captured to `diagnostics` **verbatim** and **never** written to `name`: it is a text-to-speech spelling, not the stop's name, and substituting it is the same defect as substituting from `translations.txt`. | **not represented (a)** — unambiguous. |
| `stop_lat` | `services[i].service_area.stops[].coordinates.lat` | `Number(x)`; written as a number when finite and within the schema range (see coordinate rule). | **derived** — unambiguous rule. |
| `stop_lon` | `services[i].service_area.stops[].coordinates.lon` | As `stop_lat`. | **derived** — unambiguous rule. |
| `stop_code`, `stop_desc`, `zone_id`, `stop_url`, `location_type`, `parent_station`, `stop_timezone`, `wheelchair_boarding`, `level_id`, `platform_code` | — | MSD `stop` has only `stop_id`, `name`, `coordinates`; the rest are captured to `diagnostics`. | **not represented (a)** — unambiguous. |
| other columns | — | Any further `stops.txt` column, including producer extensions, captured verbatim to `diagnostics`. | **not represented (a/b)** — unambiguous. |

- **Coordinate rule.** `Number(x)`. If the result is **finite** and within the schema's ranges
  (`lat` −90…90, `lon` −180…180, `msd.schema.json` `$defs.stop`), write **the number** — even where
  `String(Number(x)) !== x`. A trailing zero or a leading `+` is a formatting difference in the source
  text, not a loss of precision, and the schema types both coordinates as `number`, so the string form is
  not writable there in any case. Where the source text and the serialised number differ, the **original
  string is recorded in `diagnostics`**, so the byte-level form survives without distorting the document.
  Where the value does **not** parse, or parses outside the range, `coordinates` is **omitted entirely**
  for that stop — never partially, never as a string, never clamped — and the stop is recorded as a
  residual naming the unparsable value. `coordinates` is optional on `stop`, so its absence does not
  block validity, and the stop still carries its `stop_id` and `name`.
- **Only stops referenced by the location group are included (note).** Membership is decided by
  `location_group_stops.txt`, not by the full `stops.txt` file, and it is decided **per service**: a stop
  appears in each service whose location group lists it, and in no other. `wheelchair_boarding` is **not** turned
  into any accessibility assertion — absent/0 in GTFS ≠ MSD `false` (C1).

### `location_groups.txt` + `location_group_stops.txt` → `services[i].service_area.type = "stops"`

| Source field | MSD target | Transformation | Disposition |
|---|---|---|---|
| `location_groups.location_group_id` | `services[i].service_area` (identity) | Selects the flex group that defines **that service's** service area; not written as a field. | **diagnostic only** — unambiguous (structural). |
| `location_groups.location_group_name` | — | No name field on `service_area`; captured to `diagnostics`. | **not represented (a)** — unambiguous. |
| `location_group_stops.location_group_id` | — | Structural join. | **diagnostic only** — unambiguous. |
| `location_group_stops.stop_id` | `services[i].service_area.stops[]` membership | The set of `stop_id`s in the group becomes that service's stops list (with coordinates from `stops.txt`). | **derived** — unambiguous. |

- **How a route reaches its location group.** The link is structural, not by name:
  `routes.route_id` → `trips.route_id` → `trips.trip_id` → `stop_times.trip_id` →
  `stop_times.location_group_id`. Each accepted route's stop_times reference **one** location group, and
  that group defines **that service's** `service_area`.
- **One route referencing several location groups is out of scope for P1.** It is **refused with a named
  reason** (`route references multiple location groups`), never merged silently. Merging the groups would
  assert a single service area the feed does not state; splitting the route into several services would
  invent service identities the feed does not carry. Both are inventions, so the feed is refused.

`service_area.type` is set to the constant `"stops"` — this is the accepted fence edge, not a value
read from the feed. The presence of `locations.geojson` would **refuse** the feed (fence), so the
`zones` branch of `service_area` is never taken here.

### `stop_times.txt` → operating window + booking semantics

| Source field | MSD target | Transformation | Disposition |
|---|---|---|---|
| `trip_id` | — | Structural join to trip → route → service. | **diagnostic only** — unambiguous. |
| `stop_sequence` | — | Flex emits two rows (pickup seq 1, drop-off seq 2); structural, not divergent. | **diagnostic only** — unambiguous. |
| `location_group_id` | — | Establishes which flex group the trip's route serves (= that service's service area). | **diagnostic only** — unambiguous. |
| `start_pickup_drop_off_window` | `services[i].operating_hours.default[j].start` | `HH:MM:SS` → `HH:MM`, taken from the rows of the trips running on **that entry's own calendar**. Extended GTFS hours are inverted: `24:00:00` → `00:00`; `25:30:00` → `01:30` (midnight-crossing window). | **derived** — **choice** (extended-hour handling; see below). |
| `end_pickup_drop_off_window` | `services[i].operating_hours.default[j].end` | As `start`. | **derived** — **choice** (same). |
| `pickup_type`, `drop_off_type` | — | Structural codes required by the flex window rule; `2` is "arrange via agency" and `1` is "not available" on that row. The actual booking channel lives in the linked booking rule, never here. Recorded in `diagnostics` (see observed-pattern note). | **diagnostic only** — unambiguous. |
| `pickup_booking_rule_id`, `drop_off_booking_rule_id` | — | Structural link to `booking_rules` (deviation 2); read as a **union** across the route, see booking-link note. | **diagnostic only** — unambiguous. |
| `location_id` | — | Would indicate the GeoJSON-zone kind; its presence is a **refusal** trigger, not a mapping. | **not represented** (out of fence) — unambiguous. |
| `stop_id` | — | Present where a flex row also names a discrete stop; the service area is built from `location_group_stops`, not from here. Captured to `diagnostics`. | **diagnostic only** — unambiguous. |
| `arrival_time`, `departure_time` | — | Scheduled times; a location-group flex row carries a pickup **window**, not a timetable. Captured to `diagnostics`. | **not represented (a)** — unambiguous. |
| `safe_duration_factor`, `safe_duration_offset` (`trips.txt`) | — | Flex trip-duration modelling; MSD `routing_hints` carries `travel_time_factor` but not these per-window parameters, and nothing in the feed says they are the same quantity. Captured to `diagnostics`; **not** written to `routing_hints` (invention). | **not represented (a)** — unambiguous. |
| `stop_headsign`, `timepoint`, `shape_dist_traveled`, `continuous_pickup`, `continuous_drop_off`, other columns | — | No MSD target; captured verbatim to `diagnostics` (`stop_headsign` under the names-verbatim rule). | **not represented (a/b)** — unambiguous. |

- **Observed `pickup_type` / `drop_off_type` pattern.** This document previously annotated the row
  `(= 2)`, describing both codes as a placeholder set to `2`. That was carried over from the forward
  direction, where the exporter writes `2` in both, and it does not hold on a published feed. In the
  bundled fixture the pattern is `2/1` on the first row of a trip and `1/2` on the second: the `2` marks
  the direction arranged via the agency, and the paired `1` marks the other direction as unavailable on
  that row. **The forward and reverse feeds differ here**, so the inverse reads the codes as found and
  asserts nothing from their value. The disposition is unchanged — *diagnostic only*.
- **Booking links are read as a union across the route.** A route's booking rules are the set of
  **non-empty** `pickup_booking_rule_id` **and** `drop_off_booking_rule_id` values across all
  `stop_times` rows of all its trips. Neither field alone is sufficient: the bundled fixture puts the
  rule on the **pickup** link of the first row and on the **drop-off** link of the second, leaving the
  other blank each time, so reading one field would see half the picture. That half-picture is not
  merely incomplete — it feeds the divergent-booking-rules test in §`routes.txt`, where it could make
  two routes carrying the identical rule look as though they carried different ones, and refuse a feed
  that should be accepted. Empty values are skipped rather than treated as a distinct rule id.
- **Extended hours (choice).** MSD `operating_hours` times match `^[0-9]{2}:[0-9]{2}$` — a 24-hour
  clock with no >24 convention. A GTFS window crossing midnight (`…→24:00:00`, `…→25:30:00`) inverts to
  a wall-clock `00:00` / `01:30`. Where an entry's `start`/`end` cannot be expressed as `HH:MM` in
  `[00:00, 23:59]` after this reduction, it is a **finding** (a residual), not a silent truncation.
  The inversion is kept because it is the right inverse of the forward direction.
- **Midnight crossing is attested convention, not formalised schema (limitation).** After the reduction a
  crossing window has `end < start` (e.g. `21:00` → `01:30`). The schema constrains only the
  `^[0-9]{2}:[0-9]{2}$` shape and says nothing about wrap-around, but the **canonical MSD reference
  example** carries exactly such entries — `end` values of `00:00` and `01:30` against a `start` of
  `05:25` — so the wrap-around reading is the established convention in the reference material even
  though v0.1.0 does not formalise it. The inversion is therefore both the right inverse and the
  conventional form. What remains is that a consumer relying on the schema alone has nothing obliging it
  to read the entry that way; that residual risk is recorded under class (c).
- The bundled fixture's window is `09:00–17:00`, so **no midnight crossing occurs** and this reduction is
  not exercised by the reference material — see §"Rules not exercised by the bundled fixture".

### `booking_rules.txt` → `booking_rules`

MSD v0.1.0 places `booking_rules` at **document level** — one object for the whole file, not one per
service. For a single-route feed this is invisible. For a multi-route feed it collides with the
one-route-one-service rule above: P1 writes the document-level object only where every route references
the same `booking_rule_id` and the same `info_url`, and refuses with a named reason otherwise (see
§`routes.txt`). The underlying gap is recorded as §Findings 3 and referred to the build report. The
field-level mapping below is unaffected either way.

| Source field | MSD target | Transformation | Disposition |
|---|---|---|---|
| `booking_rule_id` | — | Structural key linked from `stop_times`. | **diagnostic only** — unambiguous. |
| `booking_type` | `booking_rules.advance_booking` (shape) | `0` real-time → no `minimum_minutes` asserted. `1` up-to-prior-day / `2` up-to-same-day → advance-booking fields populated from the duration/day fields below. | **derived** — **choice** (see below). |
| `prior_notice_duration_min` | `booking_rules.advance_booking.minimum_minutes` | Integer minutes, same unit — carried directly. | **direct** — unambiguous. |
| `prior_notice_start_day` | `booking_rules.advance_booking.maximum_days` | Integer days — the booking horizon (deviation 1). | **derived** — unambiguous (deviation-1 rule). |
| `prior_notice_last_day` | — | The *latest* booking day (GTFS `booking_type=2` only); no MSD target (deviation 1). Captured to `diagnostics`. | **not represented (a)** — unambiguous. |
| `prior_notice_duration_max` | — | No MSD maximum-notice-in-minutes field; captured to `diagnostics`. | **not represented (a)** — unambiguous. |
| `prior_notice_start_time`, `prior_notice_last_time` | — | Time-of-day companions to the day fields; captured to `diagnostics`. | **diagnostic only** — unambiguous. |
| `prior_notice_service_id` | — | Structural (calendar governing notice); captured to `diagnostics`. | **diagnostic only** — unambiguous. |
| `booking_url` | `booking_rules.booking_channels[]` | **Non-empty** `booking_url` → include `"web"`. Empty/absent → no `web` channel (C1). | **derived** — unambiguous (structural presence only). |
| `phone_number` | `booking_rules.booking_channels[]` | **Non-empty** `phone_number` → include `"phone"`. The number string itself has no MSD field. | **derived** (channel) + **not represented (a)** (the number) — unambiguous. |
| `info_url` | `references.info_url` | Verbatim URI. | **direct** — unambiguous. |
| `message`, `pickup_message`, `drop_off_message` | — | Free-text booking instructions preserved **verbatim** in `diagnostics`; **never parsed** into structured fields (non-goal). | **diagnostic only** — unambiguous. |

- **`booking_type` (choice).** MSD's `advance_booking` has no direct analogue of the GTFS
  `booking_type` enum. Rule: `booking_type = 0` (real-time) asserts nothing about lead time —
  `minimum_minutes` is **omitted**, not set to `0` (C1). `booking_type` `1`/`2` populate
  `advance_booking` from `prior_notice_duration_min` (→ `minimum_minutes`) and `prior_notice_start_day`
  (→ `maximum_days`) where present. `booking_confirmation` and `passenger_identification` are **not**
  invented from `booking_type`; each registry has a single value (`immediate`, `none_required`) but the
  feed does not state either, so both are omitted.

### `feed_info.txt` → `last_updated`, `provider`, `references`

| Source field | MSD target | Transformation | Disposition |
|---|---|---|---|
| `feed_version` | `last_updated` (cascade level 1) | Parsed as `YYYYMMDD` → `YYYY-MM-DDT00:00:00Z`. Primary freshness source. | **derived** — unambiguous within the cascade; **choice** in the cascade design itself. |
| `feed_start_date` | `last_updated` (cascade level 2) | `→ …T00:00:00Z`, only if level 1 did not fire; records provenance + residual. | **derived** — unambiguous within the cascade. |
| `feed_end_date` | — | Feed validity end; no MSD target. | **not represented (c)** — unambiguous. |
| `feed_publisher_name` | `provider.name` (consistency) | `provider.name` comes from `agency_name`; this is a cross-check, not a second write. | **diagnostic only** — unambiguous. |
| `feed_publisher_url` | `provider.url` / `references` (consistency) | Cross-check against `agency_url`. | **diagnostic only** — unambiguous. |
| `feed_lang` | `provider.languages` (consistency) | Cross-check against `agency_lang`; does not override it. | **diagnostic only** — unambiguous. |
| `feed_contact_email` | `provider.contact_email` | Fallback when `agency_email` is absent. | **derived** — **choice** (precedence agency over feed_info). |
| `feed_contact_url` | `references.info_url` | Fallback for contact/info URL. | **derived** — **choice** (precedence). |
| `default_lang` | — | Captured to `diagnostics`. | **diagnostic only** — unambiguous. |

### `translations.txt` → `diagnostics.translations` only

| Source field | MSD target | Transformation | Disposition |
|---|---|---|---|
| `table_name`, `field_name`, `record_id`, `record_sub_id`, `field_value`, `language`, `translation` | `diagnostics.translations[]` | Every row captured verbatim as a **secondary label**. **Never** substituted into any name; **never** written into the MSD file. | **diagnostic only** — unambiguous. |

This is the single hardest reflex to break: `translations.txt` is exactly where a helpful romanisation
or English label lives, and it must not touch a `name`. The rule is enforced by a test in
`test/lift.test.js`, which checks every one of the feed's translation values against every string in the
emitted document. `stops.tts_stop_name` is the same trap in pronunciation form.

---

## Rules not exercised by the bundled fixture

The rules below are derived from the GTFS specification and the MSD schema, **not** demonstrated on the
reference material. They are stated with the same confidence as the rest of the document, but they are
**untested against a published feed** and must not be read as verified until one exercises them. Where
a synthetic fixture covers a rule, that is noted: a synthetic fixture proves the code does what this
document says, not that a real publisher writes feeds of that shape.

- **`exception_type = 1` (added service date).** Every exception in the bundled fixture is type `2`
  (removal). The rule for added dates — an exception entry with `closed: false` and `start`/`end` omitted
  — is derived from the specification, not demonstrated on the reference material.
  *(Synthetic cover: `test/fixtures/synthetic/partial-exception/`.)*
- **Partial exception consensus.** In the bundled fixture all 48 dates are removed by **both** merged
  calendars, so the branch where only some remove a date — no entry, plus a diagnostic and a class (a)
  residual — is never taken on the reference material.
  *(Synthetic cover: `test/fixtures/synthetic/partial-exception/`.)*
- **The `provider_id` slug.** The bundled feed carries `agency_id`, so the FNV-1a fallback is never
  reached on the reference material. Nothing is known about how a real publisher's `agency_name` behaves
  under it — in particular whether two agencies in one corpus could collide.
  *(Synthetic cover: `test/fixtures/synthetic/valid-minimal/` with `agency_id` removed.)*
- **Extended-hours reduction (midnight crossing).** The bundled fixture's pickup window is `09:00–17:00`,
  so no window crosses midnight. The `24:00:00` → `00:00` / `25:30:00` → `01:30` reduction is derived from
  the specification and not exercised by the fixture. The `end < start` form it produces is attested in
  the canonical MSD reference example, but that is an attestation of the target shape, not a test of this
  conversion.

---

## MSD-required fields with no direct source field

Six values below are not direct feed content; each has a documented deterministic rule, given in the
table. They are listed here because the deliverable must show that every required field is reachable
without inventing a fact.

| MSD field | Rule | Disposition |
|---|---|---|
| `msd_version` | Constant `"0.1.0"` (schema version, not release version). | **derived** (constant) — unambiguous. |
| `services[i].service_type` | Constant `"on_demand"` — the only permitted registry value at v0.1.0. | **derived** (constant) — unambiguous. |
| `services[i].mode` | Constant `"bus"` — the only permitted registry value; the fence guarantees input compatibility. | **derived** (constant) — unambiguous. |
| `services[i].service_area.type` | Constant `"stops"` — the accepted fence edge. | **derived** (constant) — unambiguous. |
| `last_updated` | Cascade above (feed_version → feed_start_date → earliest calendar.start_date → refuse). | **derived** — **choice** (cascade order + refusal). |
| `provider.provider_id` | `agency_id` if present, else a deterministic slug of `agency_name` (rule, not result). | **derived** — **choice** when `agency_id` absent. |

`services[i].service_id` is `route_id` (direct); `services[i].name`, `provider.name` and
`provider.provider_id` (when `agency_id` is present) are direct feed content. So a valid MSD file is
reachable from this feed kind **without inventing any fact**, provided `last_updated` resolves at cascade
level 1, 2 or 3; only `provider_id` and `name` are required on `provider`, and both come from
`agency.txt`. Every other `provider` property — `url`, `contact_email`, `country`, `languages` — is
optional, so its absence never blocks validity.

---

## Choices made (not unambiguous inverses)

Collected for review — these are the decisions the inverse could not make mechanically:

1. **The fence is applied feed-wide, not per route** — a feed mixing a conforming flex route with a
   non-conforming one is refused whole, naming the offending `route_id`; no route is ever skipped.
2. **One route → one `services[]` entry**, carrying its own location group and its own calendars. A
   multi-route feed becomes a multi-service document; a single-route feed is unchanged.
3. **Route → location group via the structural join** `routes` → `trips` → `stop_times.location_group_id`,
   which is what attaches a service area to the right service.
4. **Refusal when one route references several location groups** — named reason, never a silent merge and
   never an invented service split. Out of scope for P1.
5. **A route's booking rules are the union of both link fields** — every non-empty
   `pickup_booking_rule_id` and `drop_off_booking_rule_id` across the route's `stop_times` rows. Reading
   either field alone would see half the picture on a feed that alternates them, and could refuse a feed
   whose routes in fact share one rule.
6. **Document-level `booking_rules` / `references` across several routes** — written only where every
   route references the same `booking_rule_id` and the same `info_url`; divergence is a named refusal
   plus a residual, never a document-wide assertion of one route's rule and never a merge. Single-route
   feeds unaffected. This is P1's behaviour in the presence of Finding 3, not a resolution of it.
7. **`provider_id` slug** when `agency_id` is absent — MSD requires an id the feed may not supply.
8. **`agency_timezone` inverted to `provider.country` only through an explicit table** of unambiguous
   zones (`Asia/Tokyo`→`JP`, `Europe/Zurich`→`CH`, `Africa/Kampala`→`UG`); any other zone yields no
   `country`, with provenance recorded whenever it is set.
9. **`services[i].name` precedence** — `route_long_name` preferred, `route_short_name` fallback.
10. **`route_type` 3 and 715 both collapse to `mode: "bus"`** — the distinction survives only in
   diagnostics.
11. **Day tokens `mo tu we th fr sa su`**, lowercase and Monday first, taken from the canonical MSD
    reference example. The schema leaves `days` unconstrained, so the vocabulary is a choice this document
    must make rather than one validation can enforce.
12. **Calendar merge within one service** — a route's several calendars → several `default[]` entries of
    that route's service, with the mandatory per-service `diagnostics.calendar_merge`. A modelling choice,
    individually wrong for riders where separate calendars encode a distinction the format cannot carry.
    The merge never crosses routes.
13. **Exceptions merged on consensus** — one entry per date when every merged calendar agrees; no entry
    at all when only some do, with a diagnostic and a class (a) residual instead, and never two
    conflicting entries for one date. *(The partial branch is untested on the reference material — see
    §Rules not exercised by the bundled fixture.)*
14. **`exception_type = 1`** represented as an exception entry with `closed: false`, `start`/`end`
    omitted when not otherwise stated. *(Untested — same section.)*
15. **Extended-hours reduction** for midnight-crossing windows (`24:00:00` → `00:00`, `25:30:00` →
    `01:30`); an unrepresentable window becomes a residual, not a truncation, and the resulting
    `end < start` entry follows the reference example's attested wrap-around form, with the schema's
    silence recorded under class (c). *(Untested — same section.)*
16. **Coordinates written as numbers whenever they parse finite and in range**, with the original string
    kept in diagnostics where the serialised form differs; `coordinates` omitted entirely, with a
    residual, when the value does not parse or falls outside the range — never clamped, never a string.
17. **`booking_type` interpretation** — `0` omits `minimum_minutes` (never `0`); `1`/`2` populate
    `advance_booking` only from fields structurally present.
18. **Booking channels from structural presence only** — `booking_url` → `web`, `phone_number` →
    `phone`; nothing inferred from `booking_type` or from empty fields.
19. **`last_updated` cascade** order and the refusal at level 4.
20. **Contact precedence** — `agency.txt` fields preferred over `feed_info.txt` fallbacks.

---

## Not represented — residual summary

Grouped for the P1.4 residual report. Each is neutral: a feed omission is a publisher's choice, not a
fault.

- **(a) format gaps** — provider phone (`agency_phone`), service description (`route_desc`), stop
  metadata (`stop_code`, `stop_desc`, `tts_stop_name`, …), `location_group_name`, `prior_notice_last_day`,
  `prior_notice_duration_max`, the booking phone-number string, scheduled stop times
  (`arrival_time`/`departure_time`) and the flex duration parameters
  (`safe_duration_factor`/`offset` in `trips.txt`). MSD v0.1.0 has no field for these.
  A stop whose `stop_lat`/`stop_lon` do not parse or fall outside the schema range also lands here, as a
  stop written without `coordinates`.
- **(b) feed omissions** — everything the format *could* carry but this feed does not: rider eligibility
  and membership, fares, payment methods, organisational parties (`legal_entity`), vehicles, per-channel
  booking metadata. These produce omitted MSD keys (C1) and residual entries.
- **(c) conversion / staleness** — service-calendar date range (`calendar.start_date`/`end_date`,
  `feed_end_date`); midnight-crossing windows, where the reduction produces an `end < start` entry whose
  wrap-around reading is attested in the canonical reference example but not formalised by v0.1.0, so a
  consumer following the schema alone is not obliged to read it that way; and — whenever
  `last_updated` is derived below cascade level 1 — a residual stating the publisher declares no document
  freshness of its own.

### Model coverage: a second axis on every residual

The class above says where a loss comes from. It does **not** say whether MSD could have carried the
value, and conflating the two produced a defect worth recording: an earlier report presented five
fields the schema already defines — `fare_structures`, `payment_methods`, `legal_entity`, `vehicles`,
`booking_channels` — as candidates for a future version. The statements beside them were right and the
column contradicted them.

Every residual entry therefore carries exactly one **`model_coverage`** disposition:

| Disposition | Meaning | Verifiable here? |
|---|---|---|
| `field_exists` | The schema defines the field; this feed says nothing, so the key is absent. The asymmetry is the point — the model can express it, this feed does not. | **Yes** |
| `documented_candidate` | The schema has no such field, and the absence is tracked upstream as a candidate for a future version. Carries the candidate's name. | No |
| `undocumented_gap` | The schema has no such field and no candidate is tracked for it. | Partly |

`undocumented_gap` is **an observation about the coverage of MSD v0.1.0 — not a defect, not a request
and not a proposal.** Each such entry says so in a `coverage_note`. This build's own findings live here:
provider telephone, service description, and per-route booking rules on a multi-route feed.

### Provenance of the coverage dispositions

The three dispositions do not rest on the same evidence, and a reader should not treat them as if they
did.

- **`field_exists` is verifiable from this repository** and is verified: `test/residuals.test.js`
  asserts that every such entry names a property the vendored
  `vendor/msd/schema/v0.1.0/msd.schema.json` actually defines, and that no candidate names a property
  it already defines. That check is mechanical and cannot go stale.
- **The candidate names come from an upstream register that is not vendored here**, and are therefore
  **not verifiable from this repository**. They were supplied for this build. The permitted set is
  pinned in the test as a closed list, which prevents a new name appearing silently but does not
  confirm the list is current — a weaker guarantee, deliberately distinguished from the one above.
- **Appearing in the canonical reference example is not evidence that the schema defines a field.**
  The schema leaves `additionalProperties` unset, so a document may carry keys it does not define, and
  the reference example does exactly that for several of these. **The vendored schema is the only
  test.** This is the trap the original defect fell into.
- **When the vendored pin is advanced, the candidate assignments must be re-checked.** The register
  moves independently of the schema: a candidate may become a defined field, in which case its entries
  become `field_exists`, or it may be withdrawn. The `field_exists` test will catch the first case only
  if a candidate is re-examined — it checks the claims that are made, not the ones that should be.

---

## Findings — feed content the data model has no field for

Where a spec document and the artefact disagree, the artefact is the state and the disagreement is a
finding — not something to fix by inventing a key.

1. **No `provider.phone` field.** GTFS `agency.txt` carries `agency_phone`, and a telephone number is
   the contact route this service actually uses — but the MSD schema `provider` has no telephone
   property, only `contact_email`. `agency_phone` is therefore **not represented (a)** and captured to
   diagnostics. Writing a `provider.phone` pass-through key would invent a field the data model does not
   define; omission over invention forbids it.
2. **No `service.description` field.** GTFS `routes.txt` carries `route_desc`, and a service's identity
   is plainly more than its name — but the schema `service` has no `description` property, although
   `provider` does. `route_desc` is therefore **not represented (a)** / diagnostic, not a written
   field.

3. **`booking_rules` and `references` are document-level, `services` is an array.** The schema puts
   `booking_rules` and `references` on the document root (verified in
   `vendor/msd/schema/v0.1.0/msd.schema.json`), while `services` is an array with `minItems: 1`. A
   multi-route feed can therefore carry per-route booking rules or per-route `info_url` values that the
   document can hold only once. The one-route-one-service rule does not resolve this, and no rule here
   invents one: writing one route's booking rules as the document's would assert them for every service,
   and merging divergent rules would assert a rule no route states. For a single-route feed the question
   does not arise, and the mapping above applies unchanged. How P1 behaves in the meantime is fixed in
   §`routes.txt` — write only on full agreement between the routes, named refusal otherwise; **the gap
   itself is referred to the build report** — scope discipline: a question arising mid-build goes into
   the report, not into scope.

Findings 1 and 2 are recorded for the build report; neither is a defect to fix against upstream.
Finding 3 is a consequence of the multi-route generalisation. P1's behaviour in its presence is settled
(§`routes.txt`), so it blocks nothing in P1.3; what remains open is the modelling gap itself, which is a
matter for the build report and for a later package.

---

## The export direction — the country-to-timezone table, extended locally

Everything above describes the ingest direction, GTFS-Flex → MSD. This section records the one
place where the **export** direction, MSD → GTFS-Flex, needed a local addition. It is here rather
than in a document of its own because `docs/mapping.md` is the specification, and a reader
checking what this repository asserts should not have to know which file to open.

**The precondition.** GTFS requires `agency_timezone`. MSD carries no timezone field, so the
vendored exporter (`vendor/msd-engine/`) derives one from `provider.country` through an explicit
table, and **aborts on a country the table does not carry** rather than guessing. That refusal is
correct and is kept: a wrong timezone shifts every operating window in the generated feed
silently, and nothing downstream would notice.

**The addition.** Upstream's table maps two countries. The reference case's `provider.country` is
`JP`, which is not one of them, so the export direction could not run at all. One entry is added:

| country | timezone | basis |
|---|---|---|
| `JP` | `Asia/Tokyo` | Japan observes a single zone (UTC+09:00) nationwide, with no daylight saving. |

**This is a documented assumption, not something the feed says.** The feed asserts a country; it
does not assert a timezone. The mapping from one to the other is an assumption this repository
makes on the export side, and it is only safe because the country in question has exactly one
zone — the same constraint upstream's own table states for itself. A country with more than one
zone cannot be resolved from the country code and must keep aborting.

**Upstream is untouched.** The addition is bridge code (`src/core/country-timezone.js`) and stays
bridge code. No file under `vendor/` is modified, no issue or pull request is opened upstream, and
no registry value is proposed.

### The route taken, and what made it available

Two routes were open. **Injection was taken** — the preferred one — because inspection showed it
was actually available, which was not certain in advance:

- The table itself, `COUNTRY_TZ` in the vendored `core/convert.js`, is a module-local `const` and
  is **not** reachable from outside. On that fact alone the fallback route would have been forced.
- But `countryToTimezone` — the only function that reads the table — **is** exported, and the
  vendored adapter calls it as `core.countryToTimezone(…)`: a property lookup on the required
  module object, performed at call time, not a value captured at import.
- So replacing that one property on the module object before the exporter runs is sufficient.
  `src/export.js` does exactly that, wrapping upstream's resolver so upstream's answer wins
  wherever it has one and the bridge answers only where it does not.

**The fallback was therefore not needed:** no derived copy of `convert.js` exists, there is one
copy of each vendored file, both are byte-identical to upstream, and the drift check covers them
unchanged. Had the resolver been captured at import instead of resolved at call time, the
documented derived copy would have been the only route left, and it would have been recorded here
with its pristine twin.

`test/export.test.js` holds all of this: the reference feed exports without aborting, an unmapped
country still aborts, the extension never overrides an upstream answer, and the vendored source
still carries upstream's own two-country table and no addition of ours.
