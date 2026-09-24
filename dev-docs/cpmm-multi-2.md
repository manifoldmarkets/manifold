# cpmm-multi-2

`cpmm-multi-2` is a multiple choice market mechanism where each answer has its
own CPMM `p`, the parameter binary `cpmm-1` markets already carry. With `p`
fixed at 0.5, a `cpmm-multi-1` pool can only hold an answer away from an even
split by throwing away shares its liquidity bought, so a market opened at
uneven odds loses part of the creator's liquidity. A per-answer `p` lets every
answer open at its own odds with none of it lost.

Once the creation switch below is on, markets created with starting
probabilities (`answerProbs`) and no way to add answers later open as
`cpmm-multi-2`. Every other market is still created as `cpmm-multi-1` and
trades exactly as before. The mechanism, pool math, proofs
and benchmarks come from Evan's PR, #3934, and https://github.com/evand/manifold-math.

Answers that sum to one open with depth in proportion to √(q(1 − q)), and
every outcome pays the creator back exactly the ante. Evan's closed form
builds those pools wherever it gives every answer at least half the depth it
aims for; elsewhere, or where it has no solution, `cpmmMulti2MaxDepthPools`
solves the same shape exactly. Whole-market liquidity adds, and the drizzle,
merge in whatever creation would open at the current odds.

## Switches

Both live in `common/src/contract.ts`.

- `CPMM_MULTI_2_CREATION_ENABLED` opens new markets with starting
  probabilities as `cpmm-multi-2`. Turning it off makes those markets
  `cpmm-multi-1` again, seeded as #4082 did; existing `cpmm-multi-2` markets
  keep trading as `cpmm-multi-2` either way.
- `CPMM_MULTI_2_CONVERSION_ENABLED` converts an existing `cpmm-multi-1` market
  to `cpmm-multi-2` the first time a user adds liquidity to it. It is off:
  conversion changes how a live market fills limit orders and takes liquidity.

## Deployment

Apply `backend/supabase/migrations/2026092301_add_answers_p.sql` before
deploying the API or the scheduler. It adds `answers.p` (`not null default
0.5`), which every answer write includes from then on, `cpmm-multi-1` answers
too, so until the column exists creating any multiple choice market or adding
an answer fails, and so does the scheduler's daily sports-market creation.
The migration is additive and idempotent: existing rows read `p = 0.5`, which
is what `cpmm-multi-1` pricing already assumes, so nothing changes for them.

With both switches off nothing prices differently: `cpmm-multi-1` and `cpmm-1`
bets, sells, limit fills, basket buys, liquidity and payouts come out exactly
as before, errors included. Two binary-market exceptions, both where main
produces NaN: a trade that drains its pool at an extreme `p`, which placeBet
refuses either way, now previews as 0% or 100%; and, away from p = 0.5, a fill
too small for the pool to register now pays no fee instead of a NaN one.

Turning creation on changes what `answerProbs` does in the public API, so
update `docs/docs/api.md` in the same deploy: starting probabilities open a
`cpmm-multi-2` market, and are refused on markets where answers can be added
later instead of seeding a lossy `cpmm-multi-1` market with an "Other"
remainder.

## Known limits

- Buying several answers at once (`multi-bet`) is refused on `cpmm-multi-2`
  markets. Its solve takes about 1s at 10 answers and 6s at 50, blocking the
  API's event loop.
- Single-answer bets and sells cost 2–4x `cpmm-multi-1`: about 13ms at 10
  answers, 40ms at 30, 70ms at 50 and 140ms at 100, against 6, 11, 19 and
  33ms.
- An answer's `p` can sit as far from 0.5 as a binary market's, so, as on a
  binary market, a big enough trade can drain one side of its pool outright.
  Those trades are refused with "Trade too large for current liquidity pool".
  Small pool sides are fine: a long shot's NO side opens at about 0.001 of the
  ante. In random lifecycles no trade of up to half the market's liquidity was
  refused, and about 0.2% of trades of up to three times it were.
- The per-answer drizzle leaves a subsidy pending on an answer within a
  millionth of 0% or 100%, where floating `p` to hold the probability would
  leave the pool math too little precision. Resolution pays pending subsidy
  out.
- Markets where answers can be added later can't take starting probabilities
  while `cpmm-multi-2` creation is on. Adding an answer to a sum-to-one
  `cpmm-multi-2` market credits the pool's NO shares in `Other` to the creator
  as bets, which isn't settled for markets with several liquidity providers.
- Adding liquidity to a single answer is only offered on `cpmm-multi-2`
  markets, or `cpmm-multi-1` ones the add would convert. A `cpmm-multi-1`
  answer is pinned at `p = 0.5`, so it would throw most of the subsidy away on
  an answer far from 50%.
