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

## Status

This is a **reference and demonstration tool**, not an operated service. It carries no
availability promise and no maintenance commitment. It exists to show that the bridge is
buildable and to make its structural losses legible.

## Licensing

Code here is AGPL-3.0. Vendored schema and registry, vendored validation core, and bundled
sample feeds each travel under their own licence. See [`NOTICE`](NOTICE) for the four regimes
and [`docs/dependency.md`](docs/dependency.md) for the vendoring record.
