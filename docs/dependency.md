# Vendored dependency — `leala-io/msd`

This repository consumes the MSD data model (schema, registry code lists, and the
validation core) from `leala-io/msd`. The artefacts are **vendored**: copied verbatim
into `vendor/msd/` and pinned by commit. This file is the single decision record for that
dependency (there is no general decisions log).

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

Two further files live under `vendor/msd/` but are **not** vendored artefacts and are outside the
hash table above:

- `vendor/msd/COMMIT` — the pinned commit SHA, this repository's own pin record.
- `vendor/msd/core.mjs` — an ESM shim that re-exports `validateMsd` and `formatErrors` from the
  CommonJS `core.js` via `createRequire`. It is this repository's own code (AGPL-3.0), Node-only by
  construction, and kept out of `src/core/**` so the pure core stays browser-portable. A browser
  build bundles `core.js` directly — bundlers handle CommonJS natively and the shim is not needed
  there.

## Update path for a future MSD release

1. Clone `leala-io/msd` read-only into a temporary directory and check out the new commit.
2. Copy the same 16 files verbatim into `vendor/msd/`, preserving the upstream directory shape.
3. Recompute `shasum -a 256` and byte sizes; replace the table above and `vendor/msd/COMMIT`.
4. Update the pinned commit, the tag-object note, and the retrieval date.
5. Re-run the drift check (`node scripts/check-vendor-drift.mjs`) until it passes.

Never edit a vendored file in place. If upstream changed something, the change arrives by re-vendoring
a new commit, not by hand-editing under `vendor/msd/`.

## Drift check

`scripts/check-vendor-drift.mjs` (CI gate, offline, no network) parses the table above, recomputes the
sha256 and byte size of each listed file, and fails on any mismatch. It also fails if the set of vendored
files on disk does not exactly match the table — a file added to or removed from `vendor/msd/` (other than
the two repo-owned files named above) is drift. This enforces that vendored files remain unmodified.
