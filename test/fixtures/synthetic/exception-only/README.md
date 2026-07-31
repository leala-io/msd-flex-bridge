A feed of the accepted kind whose service days exist only as dated exceptions: `calendar.txt` carries
its header and no data rows, while `calendar_dates.txt` adds six individual dates. Must be refused
with `exception_only_calendar` — fence edge (c).

No real feed in this project exercises this shape, which is why it is synthetic. The header-only
variant is the subtler of the two the fence catches; the test suite derives the other one, where
`calendar.txt` is absent entirely, by removing the file from this fixture.

Everything else is the `valid-minimal` feed unchanged, so the only reason this one is refused is the
calendar shape.
