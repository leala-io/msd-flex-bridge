# msd-flex-bridge

A reference bridge that reads a published GTFS-Flex feed of the location-group kind,
lifts it into a Mobility Service Description (MSD) file, and reports what the source
format structurally cannot express.

The bridge is deliberately narrow: it accepts feeds that describe on-demand service as a
group of named stops (`location_groups` + `location_group_stops`, without a GeoJSON zone
layer) and refuses anything outside that shape with a stated reason rather than lifting it
wrongly. Enumerating what a source cannot say — eligibility, fares, payment, vehicles,
per-channel booking metadata — is as much the point as the lift itself.

It targets the MSD **schema v0.1.0** (as published in release v0.1.1), consumed read-only
from the vendored upstream artefacts under `vendor/msd/`.

## The standard this writes into

**MSD — Mobility Service Description** is a declarative description of a service that no
timetable describes: who provides it, where and when it runs, on what booking rules, at what
fares, with what vehicles, under what settlement arrangement. It is a single file the provider
publishes itself — no booking system, no API and no platform has to stand behind it, and where
such systems do exist the document points at them. It describes a service; it does not book,
meter or settle one. The specification lives at
[`github.com/leala-io/msd`](https://github.com/leala-io/msd), and the archived release carries
the DOI [`10.5281/zenodo.20598627`](https://doi.org/10.5281/zenodo.20598627) — that is the
citable artefact, and the schema consumed here is pinned at that release.

## Where this sits

Three specifications are easy to confuse, so it is worth saying which one this bridge
reads. **GTFS-Flex**, the static description of flexible and demand-responsive service,
was adopted into the core GTFS specification in 2024; that is the format read here.
**GOFS**, the General On-Demand Feed Specification, is stewarded by the same organisation
(MobilityData) and addresses a different layer — real-time, point-to-point
demand-responsive service. An earlier draft extension, **GTFS-OnDemand**, is no longer
recommended by its steward and is not addressed here. This bridge reads the first and
produces a service description document from it.

## Usage

```
npx msd-flex-bridge lift <feed.zip | feed-dir> [-o out.msd.json]
                                               [--residuals out.residuals.json]
                                               [--diagnostics out.diagnostics.json]
```

A zip archive or an unpacked directory both work. Without `-o` the document goes to
stdout and every message to stderr, so the tool composes:

```
npx msd-flex-bridge lift feed.zip > service.msd.json
```

The residual report and the diagnostics are written only when asked for. They are
siblings of the document, never keys inside it: the residual report names what neither
the format nor this feed can express, and the diagnostics preserve every source value
that has no MSD target, so nothing is dropped silently.

Exit codes: `0` the document validates · `1` it was produced but does not validate ·
`2` the feed is not of the accepted kind and was refused, with a named reason and the
evidence · `3` the input could not be read, or the command line was not understood.

A refusal writes nothing at all — not a partial document, not an empty file.

## What to open

[`card/index.html`](card/index.html) is a static service card, generated from a lifted document
and its residual report. It shows nine description axes in four states — present, the feed does
not say, the model has no field, and open question — and the axes that stay empty are the point:
"the feed does not say" and "the model has no field" are different claims, one about a single
publisher's feed and one about the description model, and the card never shows them alike. It
opens from the file system and makes no network request.

[`docs/roundtrip.md`](docs/roundtrip.md) takes the lifted document back out into the source
format and compares it against the original feed, file by file and field by field, with every
difference classified. The normalisation decisions were fixed in writing before the comparison
was written, and the file records what each of them could hide.

## Status

This is a **reference and demonstration tool**, not an operated service. It carries no
availability promise and no maintenance commitment. It exists to show that the bridge is
buildable and to make its structural losses legible.

## Licensing

Code here is AGPL-3.0. Vendored schema and registry, vendored validation core, and bundled
sample feeds each travel under their own licence. See [`NOTICE`](NOTICE) for the four regimes
and [`docs/dependency.md`](docs/dependency.md) for the vendoring record.
