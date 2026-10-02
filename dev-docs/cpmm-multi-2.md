# cpmm-multi-2

`cpmm-multi-2` is a multiple choice market mechanism where each answer has its
own CPMM `p`, the parameter binary `cpmm-1` markets already carry. With `p`
fixed at 0.5, a `cpmm-multi-1` pool can only hold an answer away from an even
split by throwing away shares its liquidity bought, so a market opened at
uneven odds loses part of the creator's liquidity. A per-answer `p` lets every
answer open at its own odds with none of it lost.

Once the creation switch below is on, markets created with starting
probabilities (`answerProbs`) open as `cpmm-multi-2`, whether or not answers
can be added later. Every other market is still created as `cpmm-multi-1` and
trades exactly as before. The mechanism, pool math, proofs and benchmarks come
from Evan's PR, #3934, and https://github.com/evand/manifold-math.

Answers that sum to one open with depth in proportion to √(q(1 − q)), and
every outcome pays the creator back exactly the ante. Evan's closed form
builds those pools wherever it gives every answer at least half the depth it
aims for; elsewhere, or where it has no solution, `cpmmMulti2MaxDepthPools`
solves the same shape exactly. Whole-market liquidity adds, and the drizzle,
merge in whatever creation would open at the current odds.

## Adding answers

In a sum-to-one market where answers can be added, "Other" is an answer like
any other, and its pool belongs to every liquidity provider. Adding an answer
splits Other into the new answer and a new Other (`addAnswerToCpmmMulti2Pools`),
each at half of Other's probability, with pools that pay the providers exactly
what Other's did whichever answer wins. With Other's pool at (Y, N), each half
takes (Y − N + δ + ν, ν), every listed answer's YES − NO grows by δ, and
S = N − δ − 2ν is left over as mana:

- A listed answer winning pays δ more from the listed pools, 2ν from the
  halves and S: N, as Other's NO did.
- Either half winning pays its own YES, the other half's ν, the listed answers'
  NO and S: Y, as Other's YES did.

Usually ν = N/2 and δ = S = 0: Other's pool is split in two and nothing else
changes. When Other is a favourite (N > Y), each half gets a balanced pool and
the listed answers take δ = N − Y. Where a half would price below p = 0.01,
ν is lowered until it prices at 0.01.

A listed answer takes its δ holding its price: it adds δ YES (or removes δ NO)
with its p floated to hold the price, shrinks in proportion (holding p too), or
adds liquidity alongside until its p is 0.99, paid from the fee for adding the
answer and S. Where the fee isn't enough for that, the halves are made smaller
at the same p until it is, which frees S and asks less of the listed answers.
Only where even that fails, in edge cases no random market in the tests
reaches, does a listed price give a little to the halves, and the backend then
cancels the YES orders that price has passed. What's left of the fee and S
goes in as a whole-market liquidity add, or waits as the new answer's subsidy
when no answer is inside 1%–99%.

No value leaves the pools and nobody is credited a position, so each
provider's share of the pools at resolution is what it was. Traders' own
positions in Other are refined the same way as on `cpmm-multi-1`
(`convertOtherAnswerShares`): YES in Other also counts as YES in the new
answer, and NO in Other becomes YES in every answer listed before it.

The split moves Other's probability without a bet, so undoing a resolution
restores a `cpmm-multi-2` answer's probability from its pool, which resolution
leaves as it was, rather than from its last bet as `cpmm-multi-1` does.

## Pricing at extreme odds

An answer's `p` can sit as far from 0.5 as a binary market's, and a
sum-to-one market's arbitrage moves answers well past the 1%–99% band bets
are held to. A favourite opened with `p` near 1 that the market turns against
can fall to 1e-20 or below. What keeps that priceable:

- A trade's pool update is `side + amount − shares`, which cancels when the
  side ends many orders of magnitude below the amount. Away from p = 0.5 the
  side then comes straight from the invariant instead
  (`poolSideAfterPurchase`).
- The share searches in the arbitrage start from the bet amount and double
  until they bracket the answer, rather than pricing every share at the current
  probability, which cancels to 0 once the answer being bought is lost in the
  rounding of the others' probabilities.
- The arbitrage treats an amount as zero only within rounding of the amounts
  it came from, not within Ṁ0.001 as `cpmm-multi-1` does: at a general `p` an
  answer can move a long way on less than that.
- Every answer's `p` stays within [0.01, 0.99]: creation opens it there,
  trades don't move it, adding an answer keeps it there, and liquidity only
  deepens answers inside the 1%–99% band bets are held to, where floating `p`
  to hold the probability keeps it there. Beyond the band, `p` would follow an
  answer to 1e-6 or 0.999, where a trade the size of the pool leaves a side
  smaller than a double can hold. Subsidy an answer can't take waits, and
  resolution pays pending subsidy out. On an independent market every answer
  takes an equal share of a whole-market add, since resolution credits each
  provider with that share of every answer; an answer outside the band holds
  its share as its own pending subsidy.
- Nothing moves the `p` of an answer outside 1%–99% toward its price, which
  would leave the answer priced by a sliver of one side: at 1e-17 with
  `p` = 0.05 an answer is priced by 1e-13 of NO, so a trillionth of a mana
  would move it to 70%, below what the arbitrage's arithmetic can resolve. A
  whole-market add merges the creation shape, which re-derives every `p`, only
  when every answer is inside the band, and otherwise goes to the answers
  inside it, weighted by the depth creation would give them. Splitting Other
  only raises the `p` of an answer near 0%, and keeps the `p` of one near
  100%. Trades can't get an answer there either: pushing a low-`p` answer
  toward 0%, or a high-`p` one toward 100%, moves its price only in proportion
  to the mana spent.
- Splitting a tiny Other is the one way an answer comes to be priced by a
  sliver of its pool. Each answer added halves Other, so a market that gains
  answers while nobody buys Other ends up with answers far below 1% (from 30%,
  the 50th opens near 3e-16), with NO sides to match; once one is bought up,
  its pool is all but empty. Trades through those can miss summing to one by
  more than the arithmetic resolves: a buy on dev left a market summing to
  164%. So a `cpmm-multi-2` single-answer buy or sale that misses summing to
  one by more than 1e-9 is solved again. A buy is priced from the other
  answers: with s shares in each of them, the answer must end at one minus
  the sum of their prices, and its own leg buys it to exactly that. A sale
  searches each leg's shares directly, down to adjacent floats. placeBet
  refuses one that still misses by more than 1e-6 with a 403, unless the
  market was already that far off and the trade leaves it no further. Buys
  stay exact 200 splits deep. A big sale of an answer bought up from about
  100 splits deep can be refused, though a smaller one goes through.
- Shares of a side that is under one ulp of them cost a mana each: the answer
  is that certain. (Pricing them at 0 let a sale elsewhere in the market count
  NO it never bought and pay the seller for it.)
- A binary or independent answer's sale finds the cost of the opposite shares
  by bisecting between their current price and a mana each. Within an ulp or
  so of 0% or 100% that cost is a sliver of the bracket, finer than bisection
  resolves, so where the amount found misses the shares asked it's searched
  again on its log.
- A fill that can't make progress (a pool too degenerate to price) ends the
  fill loop instead of repeating forever.

The general-p cost of a number of shares is solved by Newton's method on the
invariant, in log1p form.

## Switches

Both live in `common/src/contract.ts`.

- `CPMM_MULTI_2_CREATION_ENABLED` opens new markets with starting
  probabilities as `cpmm-multi-2`. Turning it off makes those markets
  `cpmm-multi-1` again, seeded as #4082 did; existing `cpmm-multi-2` markets
  keep trading as `cpmm-multi-2` either way. It is on for dev only
  (`ENV === 'DEV'`) and off in production.
- `CPMM_MULTI_2_CONVERSION_ENABLED` converts an existing `cpmm-multi-1`
  multiple choice market to `cpmm-multi-2` the first time a user adds liquidity
  to it (`convertsToCpmmMulti2`). Numeric and date markets never convert: they
  bet across several answers at once, which `cpmm-multi-2` refuses. It is off:
  conversion changes how a live market fills limit orders and takes liquidity.
  A conversion can land between an earlier read of a market and a transaction
  on it, so backend code that writes with `cpmm-multi-1` or `cpmm-multi-2`
  math reads the mechanism inside its transaction.

## Deployment

Apply `backend/supabase/migrations/2026092301_add_answers_p.sql` before
deploying the API or the scheduler. It adds `answers.p` (`not null default
0.5`), which every answer write includes from then on, `cpmm-multi-1` answers
too, so until the column exists creating any multiple choice market or adding
an answer fails, and so does the scheduler's daily sports-market creation.
The migration is additive and idempotent: existing rows read `p = 0.5`, which
is what `cpmm-multi-1` pricing already assumes, so nothing changes for them.
Answers in a market row's cached copy (`data.answers`) have no `p` until the
market next changes, and the scheduler and the site price from that copy, so
every read of an answer's `p` falls back to 0.5 (`answerP`).

With both switches off, `cpmm-multi-1` bets, basket buys, answer adds,
liquidity and payouts come out exactly as before, errors included, and so do
sells, with one deliberate exception: a fill too small for the pool to
register now pays no fee instead of a NaN one, which failed the whole sale
with "only works for p = 0.5, got NaN". A 60/40 market with a NO order resting
on the 40% answer at 40% failed a third of such sales on main. A drained pool
still fails the same recognizable way. `cpmm-1` bets are identical; its only
differences are sells so large they leave a pool side under cpmm-1's 0.01
floor, which placeBet refuses either way, and which now preview a pool from
the invariant instead of a cancelled subtraction (or 0% or 100% where main
showed NaN). On any market, a sale whose cost main's search found so coarsely
that it sells more than a millionth more or fewer shares than asked now sells
the shares asked; that takes a price within about an ulp of 0% or 100%, and
no random state in the differential test reaches one.

From this deploy on, answers in API and websocket responses carry `p`: 0.5 on
every `cpmm-multi-1` answer, an added field. Turning creation on doesn't
change which requests the public API accepts, but markets created with
`answerProbs` then report `mechanism: 'cpmm-multi-2'`, and their answers' `p`
varies; note that in `docs/docs/api.md` in the same deploy.

## Known limits

- A single-answer bet or sale takes up to about 1.6 times as long as on
  `cpmm-multi-1`, most on markets opened at skewed odds. A Ṁ100 buy with 20
  resting orders takes about 5ms at 10 answers, 12ms at 30, 16ms at 50 and 33ms
  at 100, against 6, 9, 12 and 23ms. On a market opened with a favourite and
  1% long shots, one with no resting orders takes 3.1, 9.5, 16.7 and 30.6ms,
  against 2.1, 6.4, 10.3 and 21.7ms. These are medians in plain node, as
  production runs; under jest the gap measures several times wider.
- Buying several answers at once (`multi-bet`) is refused on `cpmm-multi-2`
  markets. Its solve fails its own verification (so the bet would fail, not
  mis-price) on about 1% of fuzzed baskets: where a large order rests on an
  answer outside the basket, the basket's cost jumps past the bet amount at
  the order's price, and the solve, which searches the basket's shares and
  prices the other answers from them, can't land inside the jump. Searching
  the other answers' shares instead, as the single-answer arbitrage does,
  would spend exactly the bet by construction. The solve takes about 70ms at
  10 answers and 0.7s at 50, against 35ms and 170ms on `cpmm-multi-1`. The
  site only sends multi-answer bets on numeric markets, which are never
  `cpmm-multi-2`, so this only affects API callers.
- Depth is concentrated where an answer's liquidity went in, as on a binary
  market: an answer is deeper than on `cpmm-multi-1` near its starting odds and
  thinner far from them. In a Ṁ1,000 market with a 95% favourite and 15 long
  shots, Ṁ30 against the favourite moves it to 90.9% (87.8% on `cpmm-multi-1`),
  but Ṁ300 moves it to 3.2% (17%). An answer that rallies from near 0% after
  liquidity went in near 0% can be moved a long way by a small bet.
- An answer added once Other is tiny opens near 0% with almost no liquidity of
  its own, and once it's bought up its price moves a long way on little,
  whichever answer is traded. Trades the arithmetic can't resolve there are
  solved again (see Pricing at extreme odds), which takes about 0.2s at 50
  answers and 0.5s at 100 under jest, and a few very deep in such a chain are
  refused. A floor on how far Other can be split would keep markets out of
  this.
- Adding liquidity to a single answer is only offered on `cpmm-multi-2`
  markets, or `cpmm-multi-1` ones the add would convert. A `cpmm-multi-1`
  answer is pinned at `p = 0.5`, so it would throw most of the subsidy away on
  an answer far from 50%.
