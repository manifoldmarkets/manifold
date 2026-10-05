# cpmm-multi-2

`cpmm-multi-2` is a multiple choice market mechanism where each answer has its
own CPMM `p`, the parameter binary `cpmm-1` markets already carry. With `p`
fixed at 0.5, a `cpmm-multi-1` pool can only hold an answer away from an even
split by throwing away shares its liquidity bought, so a market opened at
uneven odds loses part of the creator's liquidity. A per-answer `p` lets every
answer open at its own odds with none of it lost.

Once the creation switch below is on, every new multiple choice market opens
as `cpmm-multi-2`, whether or not answers can be added later. One created with
starting probabilities (`answerProbs`) opens at them. One created without
opens at the even split `cpmm-multi-1` opens at, on the same pools with every
`p` at 0.5, and differs only in what comes after: liquidity added later keeps
its value, answers added open at half of what Other has, and liquidity can go
to a single answer.
Numeric and date markets, and every market created before the switch, stay
`cpmm-multi-1` and trade exactly as before. The mechanism, pool math, proofs
and benchmarks come from Evan's PR, #3934, and
https://github.com/evand/manifold-math.

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
with pools that pay the providers exactly what Other's did whichever answer
wins, plus the fee for adding the answer. It splits the shares as
`cpmm-multi-1` does (`createAnswerAndSumAnswersToOne`). With Other's pool at
(Y, N):

- Other's YES beyond its NO goes into both new pools, as YES in Other pays
  whichever of them wins.
- Its NO beyond its YES, δ = N − Y, becomes YES in every listed answer, as NO
  in Other pays exactly when one of them wins. A listed answer takes it holding
  its price: it adds δ YES (or removes δ NO) with its p floated to hold the
  price, shrinks in proportion (holding p too), or adds liquidity alongside
  until its p is 0.99, paid from the new Other's share. Only where none of
  those fits, in edge cases no random market in the tests reaches, does its
  price give a little.
- The rest of Other's pool, as many YES as NO, is mana, and so is the fee. The
  new answer's NO side takes the fee's worth, or half if there's less, and the
  new Other's the rest.

So the new answer gets a pool of its own, paid for by the fee. The fee is
tiered by the market's liquidity per answer (Ṁ25, Ṁ100, Ṁ1,000 or Ṁ10,000),
so the new answer trades about as deeply as the others. In a Ṁ1,000 market at
30/20/10/5 with Other at 35%, the new answer opens at 17.5%, and buying it to
30% costs Ṁ57 and to 50% Ṁ190, against Ṁ66 and Ṁ215 for an answer listed at
17.5% from the start in a market opened with the same liquidity.

Every outcome then pays the fee more than it did, and nothing else changes. A
pool's p sets its prices without moving any value, so the prices come last:

- The new answer opens at half of what Other has (`newAnswerOpeningProb`), as
  `cpmm-multi-1`'s split gives it, and never below 2% (`NEW_ANSWER_PROB`).
  Nobody picks its price. Other priced every unlisted answer together, and
  halving it claims nothing about which of them the new answer is. It also
  bounds what the first buyer can take from the pools by Other's own price. A
  fixed 2% opening didn't: it priced an Other at 99% as a near-certain NO, so
  on a market opened with Other alone a Ṁ100 buy of the first answer added
  took 1,184 shares and left the pools paying Ṁ15 if it won, where opening at
  half takes 192, as on `cpmm-multi-1`. A contender worth more gets bought up
  from its opening price, and a long shot barely moves anything.
- The new Other keeps the other half, or gives what it can toward the 2%
  floor, down to 1%. While Other has 3% or more, the listed answers keep their
  prices.
- Below that, the listed answers give the rest, each the same share of its
  price. With Other at 2%, Other goes to 1% and the listed answers give up 1
  point between them. An Other already below 1% stays where it is.
- A listed answer's p falls with its price, within [0.01, 0.99]. Where one
  near 0.01 couldn't give its share, every pool takes the same YES out of the
  new Other's NO, the fewest that let each give its share. YES in every answer
  pays the same whichever wins, and leaves each p more room: a favourite at
  98% keeps giving its share, add after add.
- Where even that can't make room, the add is refused with a 403. That takes
  an answer above 99%. Buys are capped at 99% on the answer bought, but sales
  and the other-answer legs of every trade aren't, so a market can be traded
  past the band: repeatedly buying NO on a favourite, buying it back up to its
  99% cap, which takes the other answers below 1%, and selling the NO back
  took one from 90% to 99.96% in 25 rounds, with every pool and payout still
  conserved. An add there still
  goes through as long as some YES the new Other can spare makes room.
- A market opened with no listed answers holds Other alone at 99%, the top of
  the band, on the pool `cpmm-multi-1` builds, which prices it at 50%. Its
  answers sum to one from the first answer added, which opens at 50% beside
  a new Other at 50%. Until then nothing can be bet: place-bet refuses bets on a
  sum-to-one market with fewer than two answers, as on `main`.

Where a listed price gives, the backend cancels the YES orders the new price
has passed. Other's resting orders are always cancelled.

No value leaves the pools and nobody is credited a position, so each
provider's share of the pools at resolution is what it was, and the adder's
fee is recorded as their liquidity. Traders' own positions in Other are
refined the same way as on `cpmm-multi-1` (`convertOtherAnswerShares`): YES in
Other also counts as YES in the new answer, and NO in Other becomes YES in
every answer listed before it.

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
- Nothing moves the `p` of an answer outside 1%–99% toward its price beyond
  what its price moves, which would leave the answer priced by a sliver of one
  side: at 1e-17 with `p` = 0.05 an answer is priced by 1e-13 of NO, so a
  trillionth of a mana would move it to 70%, below what the arbitrage's
  arithmetic can resolve. A whole-market add merges the creation shape, which
  re-derives every `p`, only when every answer is inside the band, and
  otherwise goes to the answers inside it, weighted by the depth creation would
  give them. Adding an answer moves a listed answer's `p` only with its price,
  when it gives its share of the new answer's opening price (a long shot's by
  about that much), and raises it as YES goes into its pool. Trades can't get an answer there
  either: pushing a low-`p` answer toward 0%, or a high-`p` one toward 100%,
  moves its price only in proportion to the mana spent.
- Until each new answer got a pool of its own and an opening price of at
  least 2%, splitting a tiny Other was the one way an answer came to be priced
  by a sliver of its pool. Each answer added halved Other with no floor and no
  pool of its own, so a market that gained answers while nobody bought Other
  ended up with answers far below 1% (from 30%, the 50th opened near 3e-16),
  with NO sides to match; once one is bought up, its pool is all but empty.
  Dev still has such markets. Trades through those can miss summing to one by more than
  the arithmetic resolves: a buy on dev left a market summing to 164%. So a `cpmm-multi-2` single-answer buy or sale that misses summing to
  one by more than 1e-9 is solved again. A buy is priced from the other
  answers: with s shares in each of them, the answer must end at one minus
  the sum of their prices, and its own leg buys it to exactly that. A sale
  searches each leg's shares directly, down to adjacent floats. placeBet
  refuses one that still misses by more than 1e-6 with a 403, unless the
  market was already that far off and the trade leaves it no further. Buys
  stay exact 200 splits deep. A big sale of an answer bought up from about
  100 splits deep can be refused, though a smaller one goes through.
  Multi-sell and multi-bet write their results one at a time and aren't
  solved again; each refuses, on the same test over the pools all its
  results leave, a trade that would miss. (On dev, a one-answer multi-sell
  beside an Other bought up to the 99% cap would have left a market summing
  to 4.86%; the normal sale of the same position is exact.)
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

- `CPMM_MULTI_2_CREATION_ENABLED` opens every new multiple choice market as
  `cpmm-multi-2`, with or without starting probabilities, Other-alone markets
  included; numeric and date markets stay `cpmm-multi-1`. Turning it off makes
  new markets `cpmm-multi-1` again, seeded as #4082 did; existing
  `cpmm-multi-2` markets keep trading as `cpmm-multi-2` either way. It is on
  for dev only (`ENV === 'DEV'`) and off in production.
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
too, so until the column exists creating any market with answers (multiple
choice, numeric, date) or adding an answer fails, and so does the scheduler's
daily sports-market creation.
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

From this deploy on, answers read from the answers table carry `p` in API and
websocket responses: 0.5 on every `cpmm-multi-1` answer, an added field.
Answers served from a market row's cached copy (the site's search and its
server-rendered pages, through undocumented routes) carry it only once the
market has changed since the migration, so clients treat a missing `p` as
0.5. Turning creation on doesn't
change which requests the public API accepts, but every new multiple choice
market then reports `mechanism: 'cpmm-multi-2'`, its answers' `p` varies, and
it refuses basket bets (`multi-bet`); `docs/docs/api.md` says so.

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
  `cpmm-multi-2`, so this only affects API callers, on every new multiple
  choice market.
- Depth is concentrated where an answer's liquidity went in, as on a binary
  market: an answer is deeper than on `cpmm-multi-1` near its starting odds and
  thinner far from them. In a Ṁ1,000 market with a 95% favourite and 15 long
  shots, Ṁ30 against the favourite moves it to 90.9% (87.8% on `cpmm-multi-1`),
  but Ṁ300 moves it to 3.2% (17%). An answer that rallies from near 0% after
  liquidity went in near 0% can be moved a long way by a small bet.
- A new answer opens at half of what Other has whatever its chances, as on
  `cpmm-multi-1`, whose split opens it at about half of a large Other or
  more. The first trader after the add can buy a strong contender below its
  worth, or sell a long shot down from above it, out of the pools. With Other
  at 35% or less, that costs the pools about the add's fee or less. Where
  Other holds most of the market it can cost most of the ante, and no fixed
  opening price avoids that: on a Ṁ1,000 market opened with Other alone, a
  long shot added first opens at 50%, and selling it to 1% takes about Ṁ990
  from the pools for about Ṁ9,800 spent, so a junk answer pays whoever adds
  it and sells it down, as on `cpmm-multi-1`. The fixed 2% opening this
  replaced lost as much the other way: Ṁ822 when answers worth 40%, 30%, 20%
  and 10% were added in turn and bought to their worth, against Ṁ24 at half,
  and Ṁ17 against Ṁ921 for long shots worth 5%, 3%, 2% and 1%. Holding most of
  such a market's ante back until answers have been added would cover both
  (`cpmm-multi-2-follow-ups.md`, 11).
- Whenever a bot is watching, the first trader after an add isn't the adder:
  the new answer is broadcast before the add returns, and in the fifth live
  test a bot listening on the websocket bought first in all 10 races, as it
  does on `cpmm-multi-1`. An adder who wants the new answer can buy Other
  first: YES in Other becomes YES in the new answer too.
- Once Other is below 3%, each answer added takes up to 2 points from the
  listed answers without a trade, and the first trader to buy them back gains
  what the pools lose. On a Ṁ1,000 market with a 97% favourite that's about
  Ṁ6.5 an add; `cpmm-multi-1`'s add leaves Ṁ18 there, and Ṁ10 to Ṁ12 even with
  Other at 5% or more, where this leaves nothing. Where the favourite was
  bought up instead, it can be more than `cpmm-multi-1`'s: in the fifth live
  test, buying back a favourite bought up to 98% gained Ṁ7.22 an add over 20
  adds, against Ṁ4.23.
- An add moves prices without recording a bet, so charts and `probChanges`,
  which are built from bets, show the move at the next trade.
  `cpmm-multi-1`'s add records its bet-downs as the adder's bets.
- Markets split by the old halving (see Pricing at extreme odds) keep their
  slivers. Trades the arithmetic can't resolve there are solved again, which
  takes about 0.2s at 50 answers and 0.5s at 100 under jest, and a few very
  deep in such a chain are refused.
- Adding liquidity to a single answer is only offered on `cpmm-multi-2`
  markets, or `cpmm-multi-1` ones the add would convert. A `cpmm-multi-1`
  answer is pinned at `p = 0.5`, so it would throw most of the subsidy away on
  an answer far from 50%.
