# Where the card's nine axes come from

The [service card](../card/index.html) shows nine description axes. This file names the sources
those axes are drawn from, so a reader can follow each one to its own text rather than take the
card's word for it.

## Read this first: a review standard is not a description obligation

**The legal norm below does not oblige anyone to describe anything.** It sets out criteria under
which a complementary paratransit service must not be *worse* than the fixed-route service it
parallels — a non-discrimination standard, reviewed after the fact.

The axes are description axes here for a different reason: **whoever performs that review has to
have the parameters described to them.** A criterion that cannot be checked against a published
description is a criterion checked by other means, or not at all.

The distinction matters at two of the nine axes, where the card would otherwise say something the
source does not:

- **Capacity constraints** forbids *rationing* — waiting lists, trip caps, refusals for lack of
  space. It does not ask anyone to describe a fleet. An earlier version of the card answered it
  with the description model's fleet fields — vehicle types, seat and wheelchair capacities — which
  answer a different question. The model has no key for what the criterion actually means.
- **Trip purpose restrictions** forbids *prioritising* some trip purposes over others. It does not
  ask for trip purpose to be described.

Both are carried on the card as **open questions**, and both are deliberately absent from the
residual register: they were reached by comparing a norm with a schema, not by a lift that needed a
field and found none.

## The three sources

### 1. The legal norm — a non-discrimination review standard

| | |
|---|---|
| Title | **49 CFR 37.131, Service criteria for complementary paratransit** |
| Publisher | U.S. Department of Transportation — ADA implementing regulations |
| URL | https://www.ecfr.gov/current/title-49/subtitle-A/part-37/subpart-F/section-37.131 |
| Retrieved | 2026-07-31 |

**What it is.** Six criteria against which a complementary paratransit service is measured for
comparability with fixed-route service. **Six, not seven** — reservation handling is not a seventh
criterion; it belongs to response time.

1. Service area
2. Response time
3. Fares
4. Trip purpose restrictions
5. Hours and days of service
6. Capacity constraints

**Supports:** service area · operating hours · booking rules (through response time, which covers
reservation handling) · response time · fares · capacity · trip purpose.

It does **not** support payment methods or rider eligibility: neither is among the six criteria.

### 2. The passenger-guide template — what a rider is told before a first trip

| | |
|---|---|
| Title | **Passenger Guide Brochures**, Marketing Toolkit |
| Publisher | National Rural Transit Assistance Program (National RTAP) |
| URL | https://www.nationalrtap.org/Toolkits/Marketing-Toolkit/Marketing-Tools-and-Templates/Passenger-Guide-Brochures |
| Retrieved | 2026-07-31 |

**What it is.** Practical guidance for transit agencies producing a printed passenger guide. Its
demand-response list is the relevant one here: a service area map with landmarks and key
destinations, hours of service, eligibility requirements where applicable, reservation procedures,
and how-to-ride information covering fares, fare media such as tickets and passes, connecting
services and cancellation policies.

**Supports:** service area · operating hours · booking rules (reservation procedures) · fares ·
payment methods (fare media) · rider eligibility.

It does **not** support response time, capacity or trip purpose.

### 3. The user research — information availability as a barrier

| | |
|---|---|
| Title | **A collaborative and user-centered approach to exploring the challenges and opportunities in rural transport and mobility: Towards Rural Mobility as a Service** |
| Authors | Milne, J., Nelson, J., Beecroft, M., Cottrill, C. D. and Wright, S. |
| Published in | *International Journal of Sustainable Transportation* 20(1), 46–62 (2026) |
| DOI | 10.1080/15568318.2025.2560579 |
| Licence | Open access, CC BY 4.0 |
| Retrieved | 2026-07-31 |

**What it is.** Case-study research in a rural setting, using a user-centred co-design approach. It
identifies eight common barriers for both car and non-car users, among them **a lack of
information** — the availability of service information is itself named as a barrier, not merely
assumed to matter.

**Supports:** the user-facing axes *as a class*, and that is deliberately how it is cited. The paper
establishes that missing information is a barrier in its own right; it does not publish a
field-by-field list of what a rider must be told, and this file does not attribute one to it.
Where the card names a source for an individual axis, it names the norm or the template, both of
which state their items explicitly.

## A fourth source, deliberately not listed

A fourth source corroborates the same intersection. It is internal and cannot be cited — neither by
name nor as a recognisable structural template — so it is left out entirely. **The intersection
holds without it:** every axis on the card is supported by at least one of the three sources above,
and nothing here depends on the fourth.

## Axis by axis

| Axis | Norm criterion | Passenger-guide template | On the card |
|---|---|---|---|
| Service area | service area | service area map | present |
| Operating hours | hours and days of service | hours of service | present |
| Booking rules | response time (reservation handling) | reservation procedures | present |
| Response time | response time | — | present |
| Fares | fares | fares, fare media | the feed does not say |
| Capacity | capacity constraints — rationing, not fleet | — | open question |
| Payment methods | — | fare media | the feed does not say |
| Rider eligibility | — | eligibility requirements | the model has no field |
| Trip purpose | trip purpose restrictions — prioritising, not describing | — | open question |

The last column is a property of the bundled feed and of the description model, not of the sources.
How the card decides it — and why "the feed does not say" and "the model has no field" are never
shown alike — is in [`card.md`](card.md).
