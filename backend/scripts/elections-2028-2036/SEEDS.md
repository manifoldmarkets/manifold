# Seeds for the 2028 / 2032 / 2036 generic markets

Stage A is what the committed manifests carry. We don't use Kalshi's prices: we don't have permission to use their data (decided 13 Oct 2026). The seeding that relied on them has been removed. Another
market-price source can be added later if its terms allow this use.

Nothing here reads a poll, a PVI or a race rating.

## Constraints from the create-market API

- every answer between 1% and 99%;
- the three answers sum to 100, written to one decimal place;
- normalisation floors each answer at 1% and gives the rounding remainder to
  the largest answer, so the most lopsided seed is **98 / 1 / 1**.

`normalizeSeeds` in `seeds.ts` enforces all three; `assertSeedConstraints` in `seeds.ts` re-checks every seed.

## Stage A — provisional priors (now)

Code: `seeds.ts` (`stageASeed`, parameters in `SEED_PARAMS`).
Data: `data/presidential-results.json` (see `data/README.md`).

For a unit *u* (state, DC, ME/NE elector district, or House district on the
2026 lines) and election year *y* ∈ {2020, 2024}:

1. **Two-party margin**: `m(u, y) = 100 × (D − R) / (D + R)` from certified
   votes (FEC tables for states, The Downballot's exact district totals for
   districts).
2. **Lean**: `lean(u) = mean over available y of [ m(u, y) − m(national, y) ]`.
   Equal weights (`weights`). Measuring against the national margin
   (`relativeToNational: true`) makes the prior an *even-national-environment*
   prior: a state that voted 4 points to the right of the country is R+4,
   whatever the country did. Districts redrawn since 2020 (AL, CA, FL, LA, NC,
   OH, TN, TX, UT: 173 districts) have 2024 only; the mean is over the years
   available and `yearsUsed` records it.
3. **Win probability**: `P(D) = Φ( lean / σ )`, with Φ the standard normal CDF
   and `σ = sigma2028[office] × horizonMultiplier[cycle]`:

   | office    | σ for 2028 | 2032 (×4/3) | 2036 (×5/3) |
   |-----------|-----------:|------------:|------------:|
   | president |        9.0 |        12.0 |        15.0 |
   | house     |       10.0 |           — |           — |
   | senate    |       14.0 |        18.7 |        23.3 |
   | governor  |       20.0 |        26.7 |        33.3 |

   σ is the standard deviation, in points of two-party margin, of where the
   race lands relative to its presidential lean. Presidential units track the
   lean most closely; Senate races less (incumbency, candidate quality);
   governors least (Vermont, New Hampshire, Kansas and Kentucky routinely elect
   the "wrong" party). Larger σ means more regression toward 50/50, and the
   horizon multiplier regresses 2032 harder and 2036 hardest, as the brief
   asks. Examples (2028): D+10 → president 86.7%, senate 76.2%, governor 69.1%;
   D+20 → 98.7% / 92.3% / 84.1%. For 2036 the same D+10 state is 74.8% /
   66.6% / 61.8%.
4. **Other**: `other = 1` point by default (`otherDefault`), see exceptions.
5. **Seeds**: `normalizeSeeds([P(D) × (100 − other), (1 − P(D)) × (100 − other), other])`.
6. **National market**: no lean by construction (it *is* the even
   environment): 49.5 / 49.5 / 1 in every cycle.

Changing a parameter: edit `SEED_PARAMS`, run
`npx ts-node --transpile-only elections-2028-2036/generate-manifests.ts`, and
re-run the tests. The manifests record `seed.source` (lean, σ, P(D), years
used) for every entry, so a reviewer can recompute any seed by hand.

### "Another party or independent" exceptions

Everywhere else the third answer opens at 1%. These seats get more, each with
its reason (also stored in `SEED_PARAMS.otherExceptions`):

| race | other | why |
|---|---:|---|
| 2028 Senate AK | 8% | Lisa Murkowski won the 2010 general as a write-in and has openly weighed running as an independent; top-four/RCV (if it survives the 2026 repeal vote) makes a non-party-line winner plausible. |
| 2028 Senate UT | 6% | In 2022 Democrats endorsed independent Evan McMullin instead of fielding a nominee; he took 42.8% against Mike Lee. Same seat. |
| 2032 Senate AK | 5% | Same system and tradition as 2028; less seat-specific evidence for the Class 2 seat. |
| 2032 Senate ME | 6% | Strong independent tradition (Angus King; governors Longley and King) plus ranked-choice tabulation; Class 2 seat (Collins's). |
| 2032 Senate NE | 10% | Independent Dan Osborn took 46.5% against Deb Fischer in 2024 with no Democratic nominee and is the 2026 challenger to Pete Ricketts for this Class 2 seat. |
| 2036 Senate ME | 10% | Class 1 seat is Angus King's (independent); his successor race may again feature a serious independent. |
| 2036 Senate NE | 5% | Osborn-style independent candidacies ran in 2024 and 2026; Class 1 seat (Fischer's). |
| 2036 Senate VT | 10% | Class 1 seat is Bernie Sanders's (independent since 2007); an independent successor is plausible. |

Not excepted, deliberately: Vermont 2028 (Peter Welch, D, Class 3 — no
independent dynamic); Nebraska 2028 (no Class 3 seat); Alaska 2036 (no Class 1
seat); every presidential, governor and House market (a third-party *win* of a
state's electors or a House seat is a 1% event; Utah 2016's McMullin took 21.5%
and did not win).

## Stage B — blending in the certified 2026 results (not built)

`stageASeed` takes an optional `blend` of a certified 2026 result:
`lean = (1 − w) × presidentialLean + w × (m2026(unit) − m2026(national House))`,
with `w` from `RESULTS_2026_WEIGHT` (House 0.5, Senate 0.3, governor 0.2,
president 0). There is no command that reads a certified results file and
patches the manifests yet: the earlier refresh tool also read market prices
and was removed with them. A results-only refresh would hand-fill
`{ "nationalHouse": {d, r}, "house": { "AL-01": {d, r} }, "senate": { "GA": {d, r} } }`
(two-party votes, uncontested races omitted), patch only `answerProbs` and
`seed.basis`, and reset each manifest's approval.
