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
deploying the API. It adds `answers.p` (`not null default 0.5`), which every
answer write includes from then on, `cpmm-multi-1` answers too, so creating
any multiple choice market or adding an answer fails until the column exists.
The migration is additive and idempotent: existing rows read `p = 0.5`, which
is what `cpmm-multi-1` pricing already assumes, so nothing changes for them.

## Known limits

- Buying several answers at once (`multi-bet`) is refused on `cpmm-multi-2`
  markets. Its solve takes about 1s at 10 answers and 6s at 50, blocking the
  API's event loop. Single-answer bets run at about 2.5x `cpmm-multi-1`.
- Markets where answers can be added later can't take starting probabilities
  while `cpmm-multi-2` creation is on. Adding an answer to a sum-to-one
  `cpmm-multi-2` market credits the pool's NO shares in `Other` to the creator
  as bets, which isn't settled for markets with several liquidity providers.
- Adding liquidity to a single answer is only offered on `cpmm-multi-2`
  markets, or `cpmm-multi-1` ones the add would convert. A `cpmm-multi-1`
  answer is pinned at `p = 0.5`, so it would throw most of the subsidy away on
  an answer far from 50%.
