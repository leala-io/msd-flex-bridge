# Vendored dependencies — `leala-io/msd`

This repository consumes material from `leala-io/msd` in two places, under **two separate
pins**. The artefacts are **vendored**: copied verbatim and pinned by commit. This file is
the single decision record for both (there is no general decisions log).

| Pin | Directory | What | Provenance |
|---|---|---|---|
| 1 — schema pin | `vendor/msd/` | schema, 14 registry code lists, validation core | released tag `v0.1.1`, commit `0e79571f` |
| 2 — exporter pin | `vendor/msd-engine/` | the export direction's minimal closure, 2 files | default branch, commit `d4ae0764` |

**The two pins are not equally strong, and the difference is deliberate.** The schema is the
citable released artefact: a tag, a release, a Zenodo DOI. The exporter is a working tool that
gained its pure, browser-portable form *after* that release — at the tagged commit
`engine/core/convert.js` does not exist at all, and the adapter reaches its helpers through
`engine/core/msd.js`, which pulls in `fs`, `path` and `child_process`. Pinning the exporter to
the tag would therefore mean vendoring host-dependent code; pinning it to a branch commit means
weaker provenance, because a branch moves. The second is the lesser problem, and it is recorded
here rather than smoothed over.

---

# Pin 1 — schema, registry and validation core (`vendor/msd/`)

## Form: vendored, and why the alternatives were ruled out

- **(a) npm install on the git tag — impossible.** There is no root `package.json` anywhere
  at the pinned commit (only `validator/package.json` and `web/package.json`). npm cannot
  install a subdirectory of a git repository, so the schema/registry/validator cannot be
  pulled as an npm dependency.
- **(b) git submodule — rejected.** npm does not fetch git submodules on install, which would
  break the `npx msd-flex-bridge` path this project promises. A consumer running `npx` would
  receive an empty `vendor/msd/`.
- **(c) vendored — chosen.** The 16 artefacts are copied byte-for-byte into `vendor/msd/` and
  guarded by a content-hash drift check. No install step, no submodule, no network.

## Pinned commit

```
0e79571fb7e3a66a8e351261318c853f9f8f051c
```

Published as release **v0.1.1**. The pin is the **commit**, never the tag: `v0.1.1` is an
annotated tag object (`d844d512d5e50139991f409e87f5b760099eff96`) and tags are movable, so the
tag object's SHA differs from the commit it points at. `vendor/msd/COMMIT` records the same
commit SHA.

The schema itself is version **v0.1.0** (`schema/v0.1.0/msd.schema.json`, `$id …/schema/v0.1.0/…`);
the release that publishes it is v0.1.1. These are different version numbers for different things.

## Retrieval date

2026-07-30. Cloned read-only into a temporary directory, checked out at the commit above, copied,
and the clone deleted. No working copy of upstream is kept inside this repository.

## Vendored files

Every file is a byte-for-byte copy — no reformatting, no line-ending change, no trailing-whitespace
cleanup. Hashes computed with `shasum -a 256`.

| Upstream path | Local path | sha256 | bytes |
|---|---|---|---|
| `schema/v0.1.0/msd.schema.json` | `vendor/msd/schema/v0.1.0/msd.schema.json` | `2d23f44e2c5a57761daa434b80424ffb35f502e882f81085190c9b36261a4d92` | 15844 |
| `registry/v0.1.0/booking_channel.json` | `vendor/msd/registry/v0.1.0/booking_channel.json` | `bfb2a6c9a587f6db8a1238e3f7954e4343ae60a23111651799faf3ead4a83414` | 407 |
| `registry/v0.1.0/booking_confirmation.json` | `vendor/msd/registry/v0.1.0/booking_confirmation.json` | `5eb261cc746f51b2fa080a49ec61ac0d8133a4a55a60250945f4ec24bb393cd5` | 365 |
| `registry/v0.1.0/commission_type.json` | `vendor/msd/registry/v0.1.0/commission_type.json` | `305984e11f37b05410f39569d5c014e54db8b7a860bb39cd80cabae06996f748` | 335 |
| `registry/v0.1.0/constraint_type.json` | `vendor/msd/registry/v0.1.0/constraint_type.json` | `0e4a1e39411739a6e1bc4a9b1d90f6ad4e276b4c81068d01a08b94c9d8230445` | 386 |
| `registry/v0.1.0/discount_type.json` | `vendor/msd/registry/v0.1.0/discount_type.json` | `3d79401da5446f845ac6095e078f64d370aa057ed78b9cefd37f6df1dfd565fe` | 435 |
| `registry/v0.1.0/mode.json` | `vendor/msd/registry/v0.1.0/mode.json` | `4d98d6be906f1b6ada9a8786176c81f042204c905ab9f6501598ef93944036bb` | 305 |
| `registry/v0.1.0/passenger_identification.json` | `vendor/msd/registry/v0.1.0/passenger_identification.json` | `cbbc94d5eb6a6022f70cd2d325a3bb2725e5c42228227ef24fe9c37292617b79` | 381 |
| `registry/v0.1.0/payment_method.json` | `vendor/msd/registry/v0.1.0/payment_method.json` | `fde33e572ce28b3115f01c1fd5cbe3060cb670b6460a983e3b113f532438284d` | 478 |
| `registry/v0.1.0/propulsion.json` | `vendor/msd/registry/v0.1.0/propulsion.json` | `3e695da10c81cddf04030b27e7facd6c1afb44bbe92a18316a243d9c759fbb30` | 328 |
| `registry/v0.1.0/service_type.json` | `vendor/msd/registry/v0.1.0/service_type.json` | `2a4b83f2b79f27a56b9b442d6457e3aea9847b38aee81dc9181510f0290faefe` | 401 |
| `registry/v0.1.0/settlement_model.json` | `vendor/msd/registry/v0.1.0/settlement_model.json` | `ab3c4a08d7768fdd4077f9a0703927bc5c0446bbe5884d2c71dee2339eb0c1a7` | 363 |
| `registry/v0.1.0/settlement_period.json` | `vendor/msd/registry/v0.1.0/settlement_period.json` | `456f6fcc7573227dbd561567e95dbb1da44304755fc1b1e5c2942ba2e09f86ef` | 328 |
| `registry/v0.1.0/settlement_protocol.json` | `vendor/msd/registry/v0.1.0/settlement_protocol.json` | `8d8b7b772283df7d7d6d71d474e49afc3a4550ebddf9aca22ebcbdfa1f770071` | 435 |
| `registry/v0.1.0/travel_time_source.json` | `vendor/msd/registry/v0.1.0/travel_time_source.json` | `1da4a5efa94b197d549bdf23efa50c378689ae3ba31619fb0ed4712c4a6122b8` | 358 |
| `validator/core.js` | `vendor/msd/core.js` | `13a00056b3a4985febd2cc66fc47af4fb586efb8d387e67801217e4d2f9dbc42` | 1952 |

That is 16 files: one schema, 14 registry code lists, and the validation core.

Three further files live under `vendor/msd/` but are **not** vendored artefacts and are outside the
hash table above:

- `vendor/msd/COMMIT` — the pinned commit SHA, this repository's own pin record.
- `vendor/msd/core.mjs` — an ESM shim that re-exports `validateMsd` and `formatErrors` from the
  CommonJS `core.js` via `createRequire`. It is this repository's own code (AGPL-3.0), Node-only by
  construction, and kept out of `src/core/**` so the pure core stays browser-portable. A browser
  build bundles `core.js` directly — bundlers handle CommonJS natively and the shim is not needed
  there.
- `vendor/msd/package.json` — a two-line scope marker, `{"type": "commonjs"}`, and this
  repository's own file.

  **Why it is needed.** The root `package.json` declares `"type": "module"`. That declaration
  applies to every `.js` file in the package tree, so Node parses the vendored `core.js` as ESM and
  fails on its first `require(...)` — and it fails that way *even through* `createRequire`, because
  the module type is decided by the nearest `package.json`, not by the caller. The shim alone is
  therefore not sufficient. A nested `package.json` restores CommonJS semantics for that directory
  only.

  This is the documented Node mechanism for exactly this situation, and it is deliberately **not**
  a modification of any upstream file: not one vendored byte changes, the hash table above still
  matches, and the drift check treats the marker as repo-owned. The alternatives were worse —
  renaming `core.js` to `core.cjs` would edit a vendored artefact, and copying it would create a
  second, drifting copy of upstream code. Recorded as a build finding: the incompatibility is a
  property of consuming a CommonJS artefact from an ESM package, not a defect in either project.

## Update path for a future MSD release

1. Clone `leala-io/msd` read-only into a temporary directory and check out the new commit.
2. Copy the same 16 files verbatim into `vendor/msd/`, preserving the upstream directory shape.
3. Recompute `shasum -a 256` and byte sizes; replace the table above and `vendor/msd/COMMIT`.
4. Update the pinned commit, the tag-object note, and the retrieval date.
5. Re-run the drift check (`node scripts/check-vendor-drift.mjs`) until it passes.

Never edit a vendored file in place. If upstream changed something, the change arrives by re-vendoring
a new commit, not by hand-editing under `vendor/msd/`.

---

# Pin 2 — the exporter closure (`vendor/msd-engine/`)

The export direction (MSD document → GTFS-Flex feed) is not re-implemented here. Its upstream
form is vendored, so that a roundtrip compares this repository's lift against upstream's own
exporter rather than against a second implementation written to agree with it.

## Why this pin is weaker than pin 1, and why it is still the right one

The schema is the citable released artefact. The exporter is a working tool whose pure form
post-dates the release:

- At the pinned tag `0e79571f`, `engine/core/convert.js` **does not exist**. The conversion
  helpers — country-to-timezone mapping, window conversion, day-flag conversion, date
  formatting, CSV assembly — lived in `engine/core/msd.js`, which requires `fs`, `path` and
  `child_process`, and the adapter reached them through that module.
- On the default branch, commit `aaa80c79` (2026-06-10) split those helpers into
  `engine/core/convert.js` with no requires at all, and repointed the adapter at it.

So there is no released commit at which this closure is pure. Pinning to a branch commit is the
weaker provenance — a branch moves, and this commit carries no tag, no release and no DOI — but
it is the only pin under which no host-dependent upstream file has to be vendored. Recorded as
such rather than smoothed over; the roundtrip's provenance statement has to say this out loud.

## Pinned commit

```
d4ae0764383391c6f32dbee91d18b4188e05aec1
```

The `msd` default branch at retrieval. `vendor/msd-engine/COMMIT` records the same SHA. No tag,
no release: that is the point of the paragraph above.

## Retrieval date

2026-07-31. Cloned read-only into a temporary directory, copied, and the clone deleted. No
working copy of upstream is kept inside this repository.

## The closure, and why it is exactly these two files

Determined by reading the entry module and following every `require`, not by copying a
directory:

- `engine/adapters/gtfs-flex/index.js` is the entry module — it takes a validated MSD document
  and returns the feed files, and it is where the abort on an unmapped country is raised. Its
  only `require` is `../../core/convert`.
- `engine/core/convert.js` has no `require` at all.

The closure is therefore closed at two files. Everything else under `engine/` —
`core/msd.js`, `cli.js`, `scripts/check-gtfs-report.js` — is outside it and is **not** vendored.
`core/msd.js` in particular is the host-dependent module the closure deliberately does not reach.

| Upstream path | Local path | sha256 | bytes |
|---|---|---|---|
| `engine/core/convert.js` | `vendor/msd-engine/core/convert.js` | `0f3afa91027615f153debca81ee1fd5bc4f571894ac0b587495bc2e0d7a4c1a0` | 3464 |
| `engine/adapters/gtfs-flex/index.js` | `vendor/msd-engine/adapters/gtfs-flex/index.js` | `591f42dfe59b58906fa172bf6b52f2afc83d756d36b3861a52958ae496ae1332` | 9781 |

Per-file last-modifying commit on the branch, recorded because a branch pin alone does not say
when a file last changed:

| Local path | last modified at | date |
|---|---|---|
| `vendor/msd-engine/core/convert.js` | `aaa80c793378730e593c8f6487e91abbdeace525` | 2026-06-10 |
| `vendor/msd-engine/adapters/gtfs-flex/index.js` | `0a078e7a76f9c9cfa885a582bbef8c6bdc11086b` | 2026-06-10 |

The upstream directory shape is preserved (`core/`, `adapters/gtfs-flex/`) because the adapter's
`require('../../core/convert')` resolves through it. Flattening the layout would mean editing a
vendored file.

## Purity and wall-clock scan — per file

**Vendored paths are excluded from the purity gate by design.** A wall-clock call inside a
vendored exporter would therefore be invisible until the determinism gate failed on a roundtrip,
and it would then look like a bridge defect. The closure was scanned explicitly, with the same
analyser the purity gate uses (`analyse` from `scripts/check-purity.mjs`), even though no gate
demands it:

| File | host imports | wall clock / randomness | verdict |
|---|---|---|---|
| `vendor/msd-engine/core/convert.js` | none (no `require` at all) | none | pure |
| `vendor/msd-engine/adapters/gtfs-flex/index.js` | none (`require('../../core/convert')` only) | none | pure |

Neither file reads `Date.now()`, `new Date()`, `performance.now()`, `Math.random()` or
`crypto.randomUUID()`. The exporter's one date-like input, the GTFS calendar range, is derived
from the document's `last_updated` — not from the system clock — so identical input still
produces byte-identical output. `test/export.test.js` re-runs this scan on every test run so a
future re-vendor cannot introduce a clock silently.

## Repo-owned files under `vendor/msd-engine/`

Three files here are **not** vendored artefacts and are outside the hash table above:

- `vendor/msd-engine/COMMIT` — the pinned commit SHA, this repository's own pin record.
- `vendor/msd-engine/engine.mjs` — an ESM shim that loads the two CommonJS files through
  `createRequire`. This repository's own code (AGPL-3.0), Node-only by construction, and kept
  out of `src/core/**` so the pure core stays browser-portable. It exports the `convert` module
  *object*, not only its functions, which is what makes the country-table extension injectable
  (see `docs/mapping.md`).
- `vendor/msd-engine/package.json` — the same `{"type": "commonjs"}` scope marker pin 1 needs,
  for the same reason and with the same justification: the root `package.json` declares
  `"type": "module"`, which would make Node parse these CommonJS files as ESM and fail on the
  first `require(...)`, even through `createRequire`. **Yes, the marker was needed again** — the
  question is answered here so the next reader does not have to rediscover it.

## Update path for the exporter pin

1. Clone `leala-io/msd` read-only and check out the new branch commit.
2. **Re-derive the closure — do not assume it is still two files.** Read
   `engine/adapters/gtfs-flex/index.js` and follow every `require`.
3. Scan each file of the new closure for host imports and for wall-clock or randomness calls,
   and replace the per-file table above. A host-dependent closure is a stop-and-report, not
   something to work around by vendoring the dependency.
4. Recompute `shasum -a 256` and byte sizes; replace the hash table and `vendor/msd-engine/COMMIT`.
5. Re-run the drift check and `npm test`.

---

# Drift check — both pins

`scripts/check-vendor-drift.mjs` (CI gate, offline, no network) parses **both** hash tables above,
recomputes the sha256 and byte size of each of the 18 listed files, and fails on any mismatch. It
also fails if the set of files on disk under `vendor/` does not exactly match the two tables — a
file added to or removed from either pin's directory, other than the six repo-owned files named
above, is drift. This enforces that vendored files remain unmodified.

The check covers `vendor/` as a whole, not `vendor/msd/`, precisely so that a second pin cannot be
added later without being covered by it.
