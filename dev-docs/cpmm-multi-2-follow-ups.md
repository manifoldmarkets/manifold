# cpmm-multi-2: follow-up tasks

Found by the review of #4102 and left out of it so the launch doesn't widen
the PR. Each is reproduced; the probes and verifier traces are in the review
thread on #4102. Each is meant to be its own PR stacked on the #4102 branch
(`claude/kind-turing-e25822`) until it merges, then on `main`.

## Bugs on `main` today

### 1. Multi-sell fills one resting order once per round, past its size

`calculateCpmmMultiArbitrageSellYesEqually` (`common/src/calculate-cpmm-arbitrage.ts`
~2291-2330) passes the original `unfilledBets` and `unfilledBetsByAnswer` into
every round of its `while` loop; `getBetResultsAndUpdatedAnswers` rebuilds a
fresh working book each call, so an order on a sold answer that round 1's NO
legs filled is filled again in round 2. `updateMakers` (`backend/api/src/helpers/bets.ts`
~500) writes the summed fills as the order's amount and bills the maker for
all of them. Repro: YES order of Ṁ40 resting on a0 just below its price; the
trader multi-sells YES in a0 and a1 with different share counts; the order's
fills are [40, 40]. Same on a p = 0.5 market and on `main`'s module. Fix: carry
`updatedUnfilledBetsByAnswer` / `updatedBalanceByUserId` from one round into
the next, as `calculateCpmmMultiArbitrageBetsYes` does.

### 2. Multi-sell ignores resting orders on answers it is not selling

`backend/api/src/multi-sell.ts` ~72-76 loads unfilled bets only for the
answers being sold (`getUnfilledBets` appends `and answer_id = $2`), but the
sale buys YES in every other answer and NO in all of them, so those legs move
pools through any order resting on a non-sold answer without filling it.
`sell-shares` loads the whole book (`fetchContractBetDataAndValidate`);
multi-sell should too. Same PR as 1.

### 3. A maker short of balance on a later leg leaves the taker unbacked YES

`buyNoSharesInOtherAnswersThenYesInAnswer` (~1349-1476) and its mirror
`buyYesSharesInOtherAnswersThenNoInAnswer` (~1628) price every other-answer
leg against the original balances and book, then realize fills sequentially
against working copies. One maker with orders on two other answers whose
balance covers only the first leg: the second leg's `computeFill` caps the
maker fill at 0, the pool supplies fewer than `noShares`, and the redemption
fill (~1469) still credits `noShares`. Repro: 40/35/25 market, Ṁ500 YES
orders on a1 and a2 from one maker with balance Ṁ60, Ṁ200 YES on a0: 15.7
shares in a0 exist with no NO in a2 behind them (9.3 at balance 30, 3.4 at
10). Fix: price each leg against the balances and capacity left after the
earlier legs, or size the redemption from the NO actually acquired and return
the unused mana. Sales can count one maker's balance on several legs the same
way; the backend then rejects them with "Maker has insufficient balance".

### 4. Answer broadcasts fire inside the transaction

`createAnswerCpmmMain` (`backend/api/src/create-answer-cpmm.ts`): `insertAnswer`,
`updateAnswers`, `updateAnswer` and `cancelLimitOrders` each broadcast
synchronously inside the `runTransactionWithRetries` callback, and the new
answer's id is generated inside it. An attempt that fails to serialize after
`insertAnswer` has announced an answer that never committed; the retry
announces a second one with another id, and `use-contract-updates` keeps both
until reload. Fix: collect broadcasts and emit them after `pg.tx` resolves, or
generate the id once outside the retry loop and broadcast the final answers
after commit. Same PR: load the contract's unfilled bets once in
`createAnswerAndSumAnswersToOneV2` (~553-567) instead of one query per
repriced answer. `add-liquidity.ts` has the same shape: `updateContract`
broadcasts the contract and `runTxnInBetQueue` the user's balance from inside
the transaction, so a rolled-back attempt reaches clients until the retry's
broadcast; only the answer broadcast is deferred to `continue`.

### 5. Duplicating a market with more than 20 answers copies a subset at rescaled odds

`web/components/buttons/duplicate-contract-button.tsx` ~120 builds `answerProbs`
from whatever answers the page holds, and the server-rendered contract holds
only the top 20 (`common/src/contract-params.ts` ~170) until `useLiveContract`'s
fetch replaces it; `fitAnswerProbs` rescales them to 100%. Only set
`answerProbs` when every answer is present.

### 6. Unresolve, drizzle and resolution issues on independent markets

Listed in the #4102 description under "on `main` today": unresolving one
answer doesn't give back its share of the market's subsidy (it reverts the
payout txns but not the contract's `subsidyPool` share resolution deducted,
`resolve-market-helpers.ts` ~168-181, so the share sits in the contract by
txn accounting without being drizzled or paid out); unresolving an untraded
answer resets it to 0.5; undoing N/A doesn't restore the creator's
unique-bettor bonuses. Not reproduced by this review beyond the first. (The
whole-market unresolve also left `resolution_probability` in the `answers`
row; the seventh live test confirmed it, and #4102 now clears it.)

### 6a. Retried transactions log ordinary refusals as errors

`runTransactionWithRetries` (`backend/shared/src/transact-with-retries.ts`)
logs every failed attempt at ERROR, including a 403 the handler threw on
purpose (insufficient balance, trading closed), for bets, answer creation and
now liquidity adds. Log `APIError`s under 500 at WARN, or let the caller
classify them with `isExpectedError`.

## Precision and performance, cpmm-multi-2 only

### 7. The whole-market V2 add runs the exact solve before the band check

`addCpmmMultiLiquidityAnswersSumToOneV2` (`common/src/calculate-cpmm.ts` ~1199)
calls `cpmmMulti2SumToOneCreationPools` (75-150 ms at 50-100 answers) before
`deepenable.length < answerIds.length`, and the fallback discards it whenever
any answer is outside 1%-99%. Compute `deepenable` first.

### 8. The Newton early exit can stop a step short

`calculateCpmmAmountToBuySharesFixedP` (~322) accepts a step under
`1e-15 · |next|` without checking the residual; from a start within an ulp of
the bracket's low end (a sale from a nearly empty side, slope ~1e12) it
returns with h ≈ −0.04. Worst case over 40,000 states: 7e-10 mana. Require a
small residual as well.

### 9. An added answer can open below the 2% floor when its p clamps

`partsAt` (~1441) clamps the new answer's p at 0.99; once Other's YES exceeds
its NO by more than ~4,850 times the new answer's NO side (Other ground to
about 1e-4), the opening lands under 2%, even under the 1% bet floor (0.49%
for Other {YES 5e5, NO 100}, fee 25). Payouts stay exact. Either take more NO
depth from the new Other's share in that case, or document it and assert
`>= MIN_CPMM_PROB` in the property test.

### 10. A differential test against `main` in CI

The stress sweep, the 2% sweep and the `Object.is` differential test the
description cites aren't in the repo, so CI checks `cpmm-multi-1` parity with
`main` only through pre-existing tests. The review's own probes vendored
`main`'s `calculate-cpmm.ts`, `calculate-cpmm-arbitrage.ts`, `sell-bet.ts`,
`new-bet.ts`, `calculate.ts` and `util/algos.ts` at the merge base and found
zero numeric differences over ~34,000 cases. A PROBE-gated suite built the
same way would catch regressions on the shared paths.

## Design

### 11. Where Other holds most of the market, every answer added puts the ante at risk

An added answer's opening price is a guess: Other priced every unlisted answer
together, and nothing says which of them the new one is. Where Other holds
most of the market, its pool holds most of the ante, so a wrong guess costs
the providers most of it, in whichever direction the guess is wrong. On a
Ṁ1,000 market opened with Other alone, with each answer traded to its true
chance as it's added (measured against the shipped functions):

| Answers added, in order (true chance) | Half of Other (now) | Fixed 2% (before) |
| ------------------------------------- | ------------------- | ----------------- |
| 40%, 30%, 20%, 10%                    | Ṁ24                 | Ṁ822              |
| 60%, then 25% and 10%                 | Ṁ25                 | Ṁ853              |
| long shots: 5%, 3%, 2%, 1%            | Ṁ921                | Ṁ17               |
| three junk answers                    | Ṁ1,245              | Ṁ24               |

With Other at 35% or less, either rule costs about an add's fee or less. On
the Other-alone market, a single add's worst case is Ṁ870–1,020 for every
fixed opening from 2% to half of Other, and `cpmm-multi-1` has the same
exposure: its split opens an answer at 50% beside Other alone. A fix has to
keep most of the ante out of the pools until there's a price to put it at:
open such a market with a small pool and the rest of its ante as pending
subsidy, and drizzle that in only after answers have been added and traded
(`cpmm-multi-2` deepens at the current prices without loss). That bounds what
an add can cost to the fee and the small pool, at the cost of a thinner
market for its first trades.
