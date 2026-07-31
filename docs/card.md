# The service card

`card/index.html`, with `card/card.css` beside it. Open it from the file system; nothing is
fetched and nothing needs to be running.

```
npm run card
```

regenerates the HTML from the bundled feed. The stylesheet is written by hand and is not
generated. Both files are committed so a reader of this repository can open the card without
running anything, and the test suite asserts that the committed HTML is exactly what a fresh
render produces.

## What it is for

**Evidence, not illustration.** The card shows a fixed set of description axes that a legal norm
requires, filled from a real, openly licensed feed published by someone else — and the axes that
stay empty because a discovery format does not carry them.

**The empty axes are the point.** Five of the nine carry no value. The axis set is decided in
advance and is deliberately *not* reduced to what this feed happens to fill; a card showing only
the filled axes would invert the argument it exists to make.

## The three states, and why they are never merged

| State | Meaning | What it is a statement about |
|---|---|---|
| **Present** | The feed carries it, the document carries it. | This feed and this service. |
| **The feed does not say** | The description model *has* the field. This publisher's feed leaves it empty. | One feed. |
| **The model has no field** | Nothing could carry it, whatever the feed said. | The model — and it runs against this project's own argument. |

A card that renders the last two alike has silently normalised away the entire point, and the
mistake would be as invisible afterwards as conflating "empty" with "absent" would have been in
the roundtrip diff. They differ in colour, in border style and in border width, so the distinction
survives greyscale printing and a reader who does not see colour.

**The state is read from the residual register, never re-derived.** The register already carries
the distinction as `model_coverage`, decided once at lift time with the evidence in hand. A second
derivation would be a second source of truth, free to drift from the first without anything
noticing. `field_exists` means the model could hold it; `documented_candidate` and
`undocumented_gap` both mean it has no field today. A coverage value the card has no treatment for
stops the build rather than falling into an existing state.

**Trip purpose is a fourth treatment and not a fourth state.** The norm names the axis, the feed is
silent, and the model has no key — but that was reached by comparing a norm with a schema, not by a
lift that needed a field and found none. It is shown as an **open question** and is deliberately
absent from the residual register, because writing it in would put a claim there that no build
produced.

## What the card reads, and what it does not

It reads the lifted document and the residual register. **It does not read the diagnostics.**

Diagnostics record what the source said and what the lift decided. That is not a description of the
service and must never be shown as one. The separation is structural rather than a matter of care:
the renderer has no diagnostics parameter, so no value from them can reach the page. This is also
why no translated label appears on the card, not even as a secondary one — a feed's translations
are diagnostics.

Names are carried byte-for-byte, ideographic spaces and full-width Latin characters included. No
normalisation, no whitespace collapsing, no case folding, no substitution.

### The one value the feed does not state

`provider.country` is in the document, but the feed never says it: the lift derives it from the
timezone the feed gives for its operator, through an explicit table of zones whose country is
unambiguous, omitting the country entirely for a zone outside that table. The card does not compute
it — but presenting it beside values the feed states would let a reader take it for one. It is
therefore marked **Derived** in the term, and the rule is named beneath the list. The card's opening
sentence names it too, so the claim that nothing else is computed or guessed is true of every value
on the page.

### The freshness date

Shown in the header, above the introduction, where a reader who skims meets it, and written out as
`15 February 2026` — a fixed English form, not a locale API, which would be machine-dependent for
the same reason the core carries no wall clock.

**The time component is dropped on purpose.** The `last_updated` derivation appends midnight to a
date that carries no time; displaying it would claim a precision the source does not have. The exact
stored value is kept directly beneath, in the `datetime` attribute and in a `title`, so nothing is
lost and a machine reader still gets the timestamp.

## No basemap, and therefore no map library

A basemap needs tiles; tiles need a network call at runtime; this repository makes none. The one
network exception granted so far is narrow, conditioned and recorded, and a second one would be a
decision rather than a build-time convenience.

The map is therefore plain inline SVG: the stops as points, a bounding box, a scale bar and a north
arrow, all drawn from the coordinates the document already carries. No library, no bundle step, no
CDN. What the service area has to show — where it is, how far it reaches, how densely it is served —
is carried by the points themselves; a backdrop would be prettier and would add a runtime
dependency, an attribution obligation and nothing evidential.

The points and the bounding-box coordinates are values from the document. The scale bar's length
and the projection that places a point at a pixel are computed, and the card labels them as drawing
aids so they are not read as something the feed states.

## What the tests check — and what no machine here checks

Machine-checkable, in `test/card.test.js`:

1. **Three-state fidelity** — the three states differ in state name, badge text, badge class and
   container class, and the stylesheet gives the two absent states different declarations that
   differ by more than colour. Collapsing them fails the test; this was verified by making the
   collapse and watching it fail.
2. **Name fidelity** — every stop name appears byte-identically, the nine ideographic-space names
   and the full-width Latin names included, with no collapsed whitespace and no NFKC rewriting; no
   translated value appears anywhere.
3. **No invention** — every value shown is a value the document carries, an array joined the one
   way the card joins them, or an array length. Nothing computed, rounded, defaulted or formatted
   into a range. Statements about absent axes are the register's own words, verbatim.
4. **Diagnostics separation** — no diagnostics-only value appears, and the renderer has no
   diagnostics parameter to leak one through.
5. **Determinism** — two renders are byte-identical, and the committed file is what a fresh render
   produces.

**No test here confirms that the card renders.** Nothing opens a browser, lays out a box or
measures a colour, and none of these assertions would notice if the page came out unreadable.
That is a human check. This project's earlier map build reached the same conclusion and drew the
same line: no CI gate for rendering, and a human browser check as the condition for pushing.

## Smoke-test checklist — human, and the condition for pushing

Run through this in a browser before the card is pushed. It is five questions, and a "no" to any of
them is a finding, not a nuisance.

1. **Does the card open from the file system?** Open `card/index.html` directly — by double-click
   or `file://`, not through a server. The styling must apply and nothing may fail to load. If the
   browser's network panel shows a single request beyond the two local files, that is a defect.
2. **Are the three states distinguishable to someone who has not read this document?** Look at the
   axes without reading the key first. "The feed does not say" and "the model has no field" must
   read as two different claims. Then check it in greyscale — print preview in black and white, or
   a greyscale filter — because colour alone is not a distinction.
3. **Do the names render as themselves?** The stop names, the operator name and the service name
   must appear as text, not as boxes, question marks or replacement characters. Hover a point on
   the map: its name appears as a tooltip and must be legible there too. A box means a font problem,
   not a data problem — but it makes the card useless as evidence either way.
4. **Is the extent of the service area legible without a backdrop?** The points must read as a
   place with a shape and a density, not as a scatter. The scale bar must be legible and its length
   must look plausible against the spread of the points. The bounding-box coordinates must be
   readable at the edges.
5. **Is the freshness date findable?** Someone skimming the card must find the feed's own date
   without hunting for it.

**Do not push the card before this has been done by a person.** The build cannot perform it and
does not claim to.

## Scope, held

No node markers. No network overlays, no routing, no feed rendering. No editing, no forms, no
interactivity beyond reading the page — the only interactive element is the browser's own tooltip on
an SVG `<title>`. No framework, no component library, no design system, no icon set beyond the
symbols the SVG draws itself, no font fetched at runtime, no analytics.

Node context, if it ever happens, is a separate and deliberately deferred decision. This package
does not build the surface it would sit on.

## Positioning

The card describes one service, read from one feed of one kind. Which format that is, and how it
relates to the two specifications it is regularly confused with, is stated in the
[README](../README.md) under *Where this sits*; it is not restated here, because a second statement
of the same distinction is a second thing to keep correct.
