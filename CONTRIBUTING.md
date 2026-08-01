# Contributing

This is a reference and demonstration tool maintained by one person. There is no response-time
promise and no maintenance commitment — an issue or a pull request may sit for a while. That is
better said here than discovered later.

## What belongs here

Findings and fixes about **this bridge**:

- a feed shape it mishandles, or refuses when it should not
- a mapping rule that is wrong, or right for the wrong reason
- a refusal message or a diagnostic a stranger cannot act on
- a place where the documentation and the code disagree

A reproduction is worth more than a description: the feed — or the smallest fixture that shows
the behaviour — what the bridge did, and what the source actually says.

## What does not belong here

Proposals to change the **description model itself**: a new key, a new registry value, a
different shape for an existing one. Those belong upstream at
[`github.com/leala-io/msd`](https://github.com/leala-io/msd), and they are not decided in this
repository.

The reason is not procedural. A description model is worth something only while a field means
the same thing to everyone reading it, so it is not changed because a mapping here would be
more convenient. A change needs evidence from someone who has to consume the field, review, and
a working implementation. A bridge that has run into a gap has supplied none of the three.

So the gaps this bridge finds are recorded as findings — in the residual report, in the
diagnostics, in `docs/` — rather than turned into schema changes. That is the discipline, not an
oversight.

Vendored material under `vendor/` is a set of verbatim copies pinned by commit and guarded by a
drift check. It is never edited here; an upstream change arrives by re-vendoring a new commit,
as `docs/dependency.md` describes.

## Sign-off

Every commit carries a `Signed-off-by` line, certifying the
[Developer Certificate of Origin](https://developercertificate.org/) — that you wrote the change
or otherwise have the right to submit it under the project's licence. `git commit -s` adds the
line. A commit without one cannot be merged.

No AI co-authorship trailers. The sign-off names the person who takes responsibility for the
change, and nothing else belongs beside it.

## Practical

- Conventional commit prefixes: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, `build:`.
- Run the full suite and the gates before opening anything:

```
npm test
npm run test:fixture
npm run check:purity
npm run check:vendor
npm run check:terminology
```

CI runs the same gates and will not tell you anything the local run does not.
