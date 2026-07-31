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
