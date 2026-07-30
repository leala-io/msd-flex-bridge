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

## Status

This is a **reference and demonstration tool**, not an operated service. It carries no
availability promise and no maintenance commitment. It exists to show that the bridge is
buildable and to make its structural losses legible.

## Licensing

Code here is AGPL-3.0. Vendored schema and registry, vendored validation core, and bundled
sample feeds each travel under their own licence. See [`NOTICE`](NOTICE) for the four regimes
and [`docs/dependency.md`](docs/dependency.md) for the vendoring record.
