# ManiPerp Perpetual Futures

This folder contains the backend engine for the ManiPerp perpetual futures
market type. The compiled default is gated by `PERPS_ENABLED` in
`common/src/envs/constants.ts`; API incidents use `PERP_TRADING_MODE` as
described below.

The code is intentionally self-contained so the feature is easy to remove if we
decide to sunset perps. Nothing under `backend/shared/src/perps/` is imported by
the existing CPMM / multi / numeric code paths; integration points are narrow and
explicit (see "Integration points" below).

## Files

- `engine.ts` — the authoritative entry point. Exports:

  - `openOrAddPosition(contractId, userId, direction, mana, leverage, idempotencyKey?)`
    — opens a new position or adds to an existing same-side position. An opposite-side
    position is closed atomically before the new side opens. Returns
    `{ position, event, isNewUniqueBettor }`.
  - `closePosition(contractId, userId, direction, idempotencyKey?, expectedOpenedTime?, isApi?, fraction?)`
    — closes a user's position (or, on a protected-accounting contract, a
    fraction of it) at the current oracle price, credits/debits mana, and
    writes a `close` event. The optional opening timestamp prevents a stale client
    from closing a replacement position. Receipt/event `pnl` is settlement payout
    minus original deposited margin, so it includes funding; `pricePnl` preserves
    the paper's price-only π for diagnostics.
  - `runOracleUpdate(contract)` — applies liquidations + ADL at the latest oracle
    price. Called by the hourly scheduler.
  - `runFunding(contract)` — applies one funding period to all open positions.
    Called by the hourly scheduler.
  - `resolvePerp(contractId, resolverId)` — settles every open position at the
    current oracle price and returns remaining pool balances to the creator.
    The API continuation then broadcasts the resolved contract and metrics,
    refreshes both the market and embed pages, records the edit/analytics event,
    and sends ordinary resolution notifications using each final position's
    margin and payout (not lifetime market turnover).

  Every mutating call acquires a `pg_advisory_xact_lock` keyed on the contract id
  so per-contract state transitions are serialized.

- `queries.ts` — small SQL helpers used by `engine.ts` to keep the engine focused
  on state transitions rather than SQL construction. Row ↔ object converters live
  here too (e.g. `rowToPosition`).

- `accounting.ts` — accounting-mode transitions (legacy → shadow → protected,
  the verifier-gated return to legacy) and the read-only protected-basis
  simulator. Driven only by `backend/scripts/perp-protected-basis-preflight.ts`.
- `user-contract-metrics.ts` — rebuilds `user_contract_metrics` rows for a perp
  contract from its events + positions. The engine is the authoritative writer
  for current/lifetime fields; engine upserts preserve the period-history block.
- `user-contract-metric-periods.ts` — reads one repeatable database snapshot and
  derives day/week/month `ContractMetric.from` values by reversing recent
  append-only events from authoritative current positions. The period job
  patches only `from`, so it cannot overwrite a concurrent trade or funding
  update.

## Pure math

All pure math (funding, liquidation, ADL, entry/exit accounting) lives in
`common/src/perps/amm.ts` and is unit-testable without a database. Formulas come
from the ManiPerp paper; see `PerpContract.data` for parameter knobs.

## API surface

Endpoints are registered in `backend/api/src/routes.ts` and schemas live in
`common/src/api/schema.ts`:

- `POST /create-perp` (admin) — creates a new perp market. Launch-manifest
  feeds automatically receive their environment-specific required topic; the
  admin form defaults to unlisted and can apply the full reviewed launch
  recommendation in one click. Launch feeds require the environment's official
  Manifold creator account because residual backing returns to the creator.
  New markets preserve their per-side initial backing for later preflight
  auditing.
- `POST /place-perp-trade` — opens or adds to a position.
- `POST /close-perp-position` — closes a position.
- `GET /get-perp-positions` — reads open positions for a contract (optionally
  filtered by `userId`).
- `GET /get-oracle-price`, `/get-oracle-price-series` — read oracle data.
- `GET /get-known-oracle-feeds` (admin) — autocomplete for the admin create page.
- `POST /internal-write-oracle-price` (admin-authed, intended for bots) — writes a
  single `(feed_id, ts, price)` row idempotently.

The web client sends a 10-character `idempotencyKey` with each open/add/flip or
close. The key, request, and response snapshot are stored on the append-only
event, and partial unique indexes ensure a retry cannot apply the balance
mutation twice. API callers should reuse the same key after an ambiguous
network failure and generate a new key only for a genuinely new action.

## Cash backing

The M$ transaction ledger is the cash source of truth, while `poolLong` and
`poolShort` describe how that cash is allocated between sides. Every
cash-moving engine transition checks, before and after mutation:

`net M$ txns into the contract = poolLong + poolShort`

Only sub-millimana floating-point dust is tolerated. Creation, open/flip,
close, factor-zero ADL, funding, and resolution fail atomically if the ledger
and pools diverge. This is required because the generic transaction primitive
does not maintain a balance column for `CONTRACT` senders.

## Taker fee

`common/src/perps/fees.ts`. Trades execute at the cached oracle price, and
with zero fees that price is a free option for latency bots (2026-08-07: two
bots extracted ~M$70k from the BTC perp pools by sniping the then-15s tick at
a measured edge of ~1.5 bps of notional per round trip).

**The fee inverts how the tick rate matters, so read the two regimes
separately.** With NO fee, every tick is worth exercising, so total harvest
over a fixed window is `(W/T) · |move|(T)`, and since per-tick movement grows
only as ~√T, shortening the period makes extraction WORSE as 1/√T. With a fee
`F`, only ticks whose move exceeds `F` are worth taking, and the frequency of
those was measured on the BTC feed at ~T^1.95 — so the same shortening now
makes extraction dramatically BETTER for us. That is why the 2026-08-17 change
to a 5s poll is a mitigation and not a regression: it is only correct because
the fee exists. Do not remove the fee and keep the fast tick — that combination
is the worst of both, and it is the one this paragraph originally warned about.

The fee is SIZE-DEPENDENT, charged on NOTIONAL when a position is opened or
added to — closing is free, so this is the whole round-trip cost, visible up
front. The marginal rate at pool-share `s` is `takerFeeBps + takerFeeImpact
· s²` bps (defaults 10 and 0), charged as its integral over the added
notional `[N0, N1]` — see `calcPerpSizeFee` and `perpOpenFeeQuote` in
`common/src/perps/fees.ts`, which every charging and previewing path goes
through. `s` is measured against the backing pool NET of the trader's own
standing contribution, which is what makes the fee splitting-proof per
account: the pool banks each add's margin, so pricing against the gross pool
would let sequential adds ride a depth the trader deepened themselves. That
contribution is `min(costBasis, positionValue) + takerFeeCostBasis` — the
trader's CLAIM on the pool — what a close would hand back right now — which
is the same `min` `calculateAvailableCover` and `applyADL` already use, so
the fee agrees with the solvency math rather than contradicting it. The
mark-to-market floor matters because `costBasis` never shrinks when a closing
counterparty is paid out of this trader's side: once that payout happens the
raw basis deducts mana that really has left the pool, and since the fee is
quadratic in 1/depth the error squares (measured: a 1× long 40% underwater on
a market whose counterparty had realized quoted 951× a fresh account's fee
for the identical added notional, 97.4% of its own margin). The `min` cap
matters in the other direction — unrealized profit is a claim on the OPPOSING
pool, not mana this trader posted, so it must not enlarge the deduction.
⚠️ Note the asymmetry this buys: a MARK MOVE moves no mana (only closes,
factor-0 ADL and resolution do), so an UNREALIZED drawdown releases part of
the deduction while every mana is still in the pool — two holders identical
but for entry price pay ~30% different fees at impact 90. Deliberate (it
prices the claim, not the history) and bounded by the trader's own posted
margin, but it is a live calibration question, not a solvency one. The taker-fee basis
stays outside the `min`, uncapped: those were paid in cash and are not part
of the position's mark. Splitting-proofness is unaffected: at a fixed mark an
add of margin `m` raises costBasis AND positionValue by `m`, so
`costBasis − positionValue` stays constant across a trader's own adds and the
netted quantity still grows by exactly the margin the pool banked — an
underwater holder telescopes just as exactly as a flat one. A fresh
position that is share `S` of that depth
pays `base + (impact/3)·S²` bps effective — honest sub-10%-of-pool flow pays
~base while pool-scale entries pay multiples of it, and the TOTAL is
deliberately uncapped (only the base config is capped at 100 bps).

The fee is DIRECTION-BLIND by design (decided 2026-08-21): it scales purely on
how much of the pool a position absorbs, so a fresh long and a fresh short of
the same notional pay exactly the same, whatever the open-interest skew. This
comes up every time someone notices that on a long-heavy book a new short is
recapitalising the very pool the longs get paid from (`closePosition` draws a
long's profit from `poolShort`, and a short's margin and fee are both credited
there). It is deliberate: imbalance already has two dedicated mechanisms —
funding, which continuously pays the scarce side, and the OI cap, which hard-
blocks the crowded one — and making the fee a third would double-subsidise,
add a gameable dimension (skew the book to unlock a cheaper entry), and break
the splitting-proof telescoping, which needs a depth that does not move with
book state. Do not add an open-interest term here without revisiting all
three. When
reconciling a `PERP_TAKER_FEE` txn, `data.feeBps` is the EFFECTIVE rate
actually paid and `data.feeBase` the configured base at trade time — do NOT
expect fee = base × notional on a market with a nonzero impact. Every snipe
needs an entry, so an open-only fee taxes each round trip exactly once; at
the 10 bps base only oracle moves > 10 bps per tick clear one (7 occurrences
in the BTC feed's first 31h). Never charged on liquidation, ADL, funding, or
resolution. The fee is credited to the trader's side backing pool, so it
recapitalizes the market rather than accruing to the platform (tracked in
`collectedFees.liquidityFee`), and moves real mana (`PERP_TAKER_FEE` txn
user → contract) alongside the margin debit, so the cash-backing invariant
above is preserved. The position tracks its cumulative opening fees in
`takerFeeCostBasis` (kept separate from margin so leverage/liquidation math
is untouched), and every user-facing PnL number — the position card, close
receipts, portfolio metrics, period metrics, and the trade panel's profit
ladder (`getPerpPriceForUserFacingPnl` solves for the price at which that
PnL reaches a target, so each tier is net of the fee and agrees with the
card) — subtracts it: a fresh position starts at PnL = −fee. Admins tune
both knobs live per market via `update-perp-config` (base 0 disables the
flat part, impact 0 the size part); contracts created before the fields
existed default to base 10 / impact 0 at trade time.

The fee also changes what a trade COSTS to place: the debit is margin plus
fee, and on a flip the closed leg's free payout may fund it. Both the engine's
`Insufficient balance` reject and the trade panel's client-side check go
through `calculatePerpOpenCashFlow` in `common/src/perps/fees.ts` with the
quoted fee as an input (never recomputed from bps), so the preview cannot
disagree with the charge. The panel therefore opts out of `BuyAmountInput`'s
margin-only balance check (`disregardUserBalance`) — that check both passed a
max-balance open the fee makes unaffordable and blocked a payout-funded flip.

**Two channels, two rates.** `takerFeeBps` is the WEB base. Opens
authenticated with an API key instead pay `max(takerFeeBps, takerFeeApiBps)`
— see `getPerpEffectiveTakerFeeBps`, which the engine calls with the
auth-derived `isApi` flag (`auth.creds.kind === 'key'`, never
client-supplied). Unset or 0 means API flow pays the web base. The `max()`
is deliberate: a misconfigured API rate below the base can never hand bots a
discount, but it also means a submitted value at or below the base is a
silent no-op — `update-perp-config` echoes `effectiveTakerFeeApiBps` so an
operator can see what will actually be charged. Both rates are tuned live
per market via `update-perp-config`; setting `takerFeeBps: 0` disables the
fee for WEB only, and does NOT disable it for API flow while
`takerFeeApiBps` is set. Closing is free on both channels.

Why per-channel: the 2026-08-19/20 BTC drain was API-key flow (5 API accounts
were 85% of opening notional over that week against 135 web traders), so a
flat raise would tax the honest web majority for the bots' edge. A bot can
still dodge by scripting a session token — this is a raised bar and a clean
ToS line, not a wall; the structural fix is next-tick execution.

The two rates carry different domains — `PERP_TAKER_FEE_BPS_MAX` = 100,
`PERP_TAKER_FEE_API_BPS_MAX` = 300 — and neither is validated against
`maxLeverage`. Because the fee is charged on NOTIONAL but bites MARGIN —
`fee / margin = effectiveBps × leverage / 10_000` — the engine rejects any
open whose fee reaches `PERP_MAX_FEE_SHARE_OF_MARGIN` (0.5) of its own
margin. That bound covers both routes in: a fat-fingered flat rate (the top
of the API range crosses it above 17×) and extreme leverage meeting extreme
size (at impact 10, a position 3.5× the backing pool costs 51% of margin at
100× — roughly the largest short BTC's OI cap permitted on 2026-08-21). It is
unreachable at leverage ≤ 50 for any size the OI cap allows on a balanced
book, so it costs nothing in false rejections.
That floor is what keeps a fat-fingered rate survivable rather than
catastrophic; honest settings never approach it.

## Funding imbalance

The funding rate is derived from each side's OPEN INTEREST (aggregate open
notional), not from the backing pools:

`f = I(max(OI_L, OI_S) / min(OI_L, OI_S)) × f_max`, signed toward the crowded
side.

The pools hold _margin_, so their ratio only tracks exposure when both sides
run comparable leverage. Where they don't, the two disagree in sign, and a
pool-derived rate pays the crowded side and charges the scarce one — the
opposite of what funding is for. On 2026-08-08 two of the four live markets
were doing exactly that (BTC held 454k long vs 348k short of notional on pools
of 59.6k vs 83.0k; the OpenRouter market, 1.96 long-heavy on 0.82 pools).

`runFunding` recomputes open interest from the positions it holds under the
advisory lock. `contract.openInterestLong` / `openInterestShort` are a
denormalized copy maintained by every transition that can change a position
size, so read paths (market page, chart, bet panel, embed) can show the live
rate without loading positions — always via `getPerpFundingRate`
(`common/perps/funding`), never by calling `computeFundingRate` with pools.
An absent copy reads as zero, which yields a zero rate rather than a
direction we cannot substantiate.

A side with no open interest yields no funding: the transfer moves value
between the two sides' positions, so an empty side has no counterparty to
receive it. Inducing entry onto an empty side would need a mechanism paying
from somewhere other than the absent side.

## Exposure capacity

Opening, adding, or flipping into a side is limited by what the opposing side
can back. That is two things: its unreserved pool cover, plus the notional it
already has at risk and funds out of its own losses. Unreserved cover is the
opposing pool minus each opposite-side position's currently refundable value
(capped at its cost basis), matching the reserve definition used by ADL
solvency:

```
matched credit = min(opposing OI, 10 × opposing reserves)
side OI       <= min(10 × max(opposing pool - opposing reserves, 0) + matched credit,
                     10 × opposing pool)
```

This is a launch guardrail in addition to the ManiPerp paper. It preserves high
leverage for small positions while preventing a new, initially flat position
from creating unlimited future claims against finite backing. The cap applies
only to exposure-increasing actions; users can always reduce or close existing
positions. Funding, oracle movement, or legacy state can move a side above the
limit, in which case further opens are blocked until capacity recovers.

Read the multiple as an adverse move of 1/10. Over such a move this side's
profit is `OI/10`, and the opposing side funds it twice over: from the pool it
has already lost into (`availableCover`), and from the margin it is about to
lose (`matched credit`), which is forfeited into that same pool. Crediting only
the first term compares a NOTIONAL quantity against a MARGIN one and ignores
opposing notional entirely, so a market could refuse the trade that would
balance it while still accepting the trade that worsened it — on 2026-08-31 the
BTC market held 734,349 long against 928,994 short of notional, a short-heavy
book, and had 1,129 of long headroom against 544,752 of short. The two terms
telescope to at most `10 × opposing pool`, which the final `min` also enforces
directly for books whose cover has gone negative.

## Cross-side deficit transfer

A side's pool can end up below that side's own refundable margin: short profits
are paid out of `L` (see `closePosition`), and while the longs are underwater
their reserve `Σ min(costBasis, value)` is small, so those payouts pass the
solvency check — but the reserve grows back toward `Σ costBasis` if the price
mean-reverts, and the mana has already left. Twice in production: UK carbon
2026-08-07 and the OpenRouter open-weight share market 2026-08-29.

ADL cannot repair it. ADL scales profits and never cost bases, so the factor
clamps to 0, the winners are settled and removed, and the deficit remains with
no profit left to scale — `assertPerpStateSolvent` then sees `-Infinity`.

`applyADL` therefore moves the deficit across from the other pool first, when
that pool holds at least that much above its own reserve. `assertPerpEscrowBalance`
checks `L + S` against one contract balance, so the split is an accounting
convention, not a custody boundary; the transfer conserves total escrow and
moves no user balance. It is all-or-nothing: a partial transfer cannot make the
book representable but would change the ADL factors on the way to the same
throw, so it can only ever turn a failure into a success.

This does NOT stop principal being spent against an opposing side's unrealized
loss in the first place — it lets the pot honour the resulting claim out of its
own surplus. Reserving at full cost basis would prevent the spend, at the cost
of much lower profit capacity on every market. That is a separate decision.

## Solvency halt (tick liveness)

`runOracleUpdate` always commits the new price. If the post-transition state
cannot be made solvent even after liquidations, ADL, and the transfer above,
the tick writes the price and `solvencyHaltTime`/`solvencyHaltReason`, and
writes nothing else — no pools, positions, events, or metrics.

Before this, that state threw and rolled the whole transaction back, so the
cached mark never advanced and every later tick re-derived the same failure
from the same state: a permanent wedge (12h in both incidents). A frozen mark
is strictly worse than the state it refuses to write — it is wrong on the
screen, it leaves trading OPEN against a dead price for a full
`maxOraclePriceAgeMs`, and it grows the deficit it is failing on. On 2026-08-29
a trader added to a position against a mark that had been frozen for four
hours.

Because the mark now stays fresh, the implicit staleness protection is gone, so
`assertPerpNotSolvencyHalted` gates opens AND closes explicitly. Scheduler
exits (liquidation, ADL, resolution) call the internal paths and are
unaffected. `add-perp-subsidy` is deliberately not gated: it is the rescue
tool. The first tick that applies cleanly clears the halt, so topping up the
deficit side is the whole runbook.

Pending liquidations and ADL stay pending across a halt and are re-derived by
the next tick at the newer price. A position whose liquidation is deferred that
way can escape it if the price rebounds — a real but bounded transfer, accepted
against a market that is otherwise dark for hours, and trading is halted
throughout so nobody can act on the gap.

Both callers log the halt with their own prefix (`[oracle-feeds]` /
`[update-perps]`), so the existing GCP alert policies page exactly as they did
when this threw.

Two consequences of committing the price that are easy to miss:

- **`runFunding` refuses a persisted halt, read under the contract lock.** Once
  a tick halts it has committed its price, so replaying that same point returns
  `ignore`/null and a caller checking only its own oracle result sees nothing to
  skip on. Funding would then run against positions whose liquidation and ADL
  are still pending — and unlike the tick that refused to write them, funding
  persists pools, positions, and events. Before the halt existed this was
  covered incidentally, by the throw taking funding down with it.
- **A halted contract re-applies the SAME oracle point.** Otherwise the halt is
  terminal: the committed price makes every retry a duplicate, so the pending
  transition is never applied and the halt never clears no matter how much
  subsidy is added. Restricted to an exact duplicate; a stale (older) point
  stays ignored.

### Deploy order

**API first, fully rolled out and drained, THEN the perps scheduler.** Not
"same SHA" — that is not sufficient during a rolling deploy. A new scheduler
writes a fresh mark alongside `solvencyHaltTime`; an old API instance does not
know the field, sees a fresh mark, passes the freshness gate, and will happily
persist trades against the inconsistent book. The open path does not
independently verify global solvency, so nothing else catches it. The new API
is inert until a scheduler writes the first halt, so leading with it is free.

The same asymmetry applies in reverse: **do not roll the API back while halt
rows exist.** Clear them first (top up the deficit side, let a tick apply, or
clear the field directly) or roll the scheduler back with it.

## Protected-basis settlement (Workstream A)

`common/src/perps/protected-basis.ts` (pure), `accounting-mode.ts`,
`protected-migration.ts`, `risk-policy-shadow.ts`; engine integration in
`engine.ts`; transitions and the simulator in `accounting.ts`; the guarded
migration tool in `backend/scripts/perp-protected-basis-preflight.ts`. The
design and every approval gate are in the protected-basis plan; the operator
sequence is in `perps-launch-runbook.md`, "Protected-basis accounting". This
section is the engine-level description of what a protected contract does.

**Why.** Under legacy (#4030) accounting a short's realized profit is paid out
of `L` while the longs are underwater, and nothing records that the longs'
paper loss has already been spent. When the mark recovers their full
`costBasis` becomes refundable again — an unfunded recovery promise — and the
pool can no longer cover it (the two production wedges). #4030 made that
state survivable (cross-side transfer, solvency halt). Protected-basis
settlement stops it arising: the realized payout consumes the paper loss that
funded it, at the moment it is paid.

**State.** Each position carries a protected basis `b` alongside `c`
(`contract_perp_positions.reserve_basis`), with `0 <= b <= c`. `c` is still
what price PnL, value, leverage, liquidation, fees and user-facing entry
economics use — nothing was globally replaced. `b` is the part of the
position's value its own side pool still protects. At mark `P`:

```
V = max(c + π, 0)     value
R = min(b, V)         own-pool claim
E = max(V − b, 0)     contingent claim on the opposing pool
D = max(b − V, 0)     unsettled paper loss
```

so `V = R + E` and `b = R + D`. Per side, with pool `B`, `C = Σb` and
`H = B − C` (unreserved balance — subsidy, fees, liquidation-released basis
and realized surplus alike; NOT house capital), committed state must satisfy

```
0 <= b <= c    B >= Σb    E_long <= D_short + H_short    E_short <= D_long + H_long
```

`assertPerpProtectedState` checks all four, strictly. Every backing check
and every pool debit in the model goes through ONE affordability predicate,
`isPerpClaimBacked(claim, available, scale)` / `debitPool`: a claim is backed
when `claim <= available + max(dust(scale), 1e-12·|claim|)`, where `dust` is
`256ε` times the largest basis involved, capped at `1e-4`. The invariant can
therefore never accept a claim the payout path refuses, nor the reverse
(`protected-basis.test.ts` pins this at M$5m scale, the case where a relative
invariant tolerance and an absolute payment tolerance used to disagree).
Every formula reduces to #4030 at `b = c`; every legacy contract mirrors
`b = c` at the write boundary AND in the database guard.

**Transitions (all pure; the engine persists them under the contract lock in
one transaction with the ledger txns, events and metrics):**

- Open/add: `b` rises by the new margin (`openPosition`). Admission is the
  #4030 compatibility gate with reserves `min(b, V)`; `matchedCredit` and its
  opposing-OI cap are unchanged, `M = U = 10`. Post-trade the protected
  invariants replace the legacy solvency factor.
- Close (full or a fraction `z`; `closePerpProtectedPosition`): the own pool
  returns `z·R`, the opposing pool pays `z·E` — but FIRST that pool's paper
  losses are settled loss-first (`settlePerpPaperLoss`): `delta = min(W, D)`,
  allocated pro rata to `D_i` with a deterministic residual, `b_i' = b_i −
  delta_i`, never below `V_i`; only `W − delta` comes out of `H`. The
  underwater rows keep `q, c, Pe`, leverage, liquidation and value; each gets
  a user-attributed `basis-settlement` event (`reserve_basis_delta < 0`,
  everything else 0) — a receipt, not a cash flow. The surviving row on a
  partial close scales `q, c, b, originalCostBasis, takerFeeCostBasis` by
  `1 − z`. A flip runs this close before validating the new leg; if the leg
  does not fit the whole flip is rejected. Capacity never rejects a close.
  A partial close must be at least `PERP_MIN_CLOSE_FRACTION` (1%) of the
  position and must actually shrink the survivor and pay more than dust;
  anything smaller is rejected (API schema, handler and pure model alike) so
  no event, streak or `lastBetTime` can advance without a change to the
  position.
- Oracle tick: liquidation (forfeits `b` too, turning it into `H`), then
  generalized claim ADL against `E`, not π: `s = min(1, (D_opp + H_opp)/E)`,
  `q' = s·q`, `c' = b + s·(c − b)`, `b' = b`, `Pe' = Pe`, leverage and
  liquidation recomputed; `originalCostBasis`/`takerFeeCostBasis` untouched so
  the haircut shows in PnL. At `s = 0` the row is removed and `b` is paid
  once from its own pool (`PERP_CLOSE_PAYOUT`, reason `adl`). The factor is
  representability-aware: an allowance below the side's dust snaps `s` to 0
  (the pool cannot pay a claim that rounds above it), a contingent claim
  below dust is left alone at `s = 1`, and the scaled side is re-checked with
  the shared predicate before the transition is accepted.
- Funding: `applyFunding` scales `b` with `q` and `c`; then claim ADL and the
  full invariant set (`applyPerpProtectedFunding`).
- Resolution: one deterministic batch from one immutable state
  (`resolvePerpProtectedBatch`) — own pools pay `ΣR`, opposing pools pay
  `ΣE`, residual to the creator. Never sequential user closes.
- Cross-side transfer: unreachable when `B >= Σb`. `applyPerpProtectedOracleTransition`
  detects the pre-state legacy ADL would have "repaired" by moving pool
  balance and throws `PerpProtectedInvariantError('cross-side-transfer')`;
  `runOracleUpdate` turns that into a solvency halt with the kind in its
  reason (alerts through the existing `[oracle-feeds]`/`[update-perps]`
  ERROR lines). Protected accounting never moves mana between sides.

**Versioning and the database guard.** `contracts.data.perpAccountingMode`
(`legacy | shadow | protected`, absent = legacy; unknown fails closed) and
`perpAccountingEpoch` are read inside `loadStateForUpdate` under the lock.
`shadow` commits legacy ledgers and stamps rows, and alongside them keeps an
isolated forward checkpoint of the protected-basis state the contract WOULD
have (`common/perps/accounting-shadow.ts`, persisted in
`contract_perp_shadow_checkpoints`): seeded from the live state with `b = c`
and advanced, under the same contract lock, by the protected counterpart of
every committed transition — open/add/flip, close, oracle tick, funding,
subsidy, resolution. After each step the checkpoint is compared with the
live state (pools, rows, both invariant sets, and for closes the protected
vs legacy payout); the report is stored next to the checkpoint and logged as
`[perps][accounting-shadow]` when it diverges. A counterpart the protected
rules cannot apply (a book that needs a cross-side transfer, a row protected
ADL already removed) is recorded as a divergence and the checkpoint re-seeds
from live. That is cumulative validation of an existing market; the
read-only simulator (`simulatePerpProtectedAccounting`) stays the
point-in-time report, and neither ever writes a hypothetical `b` to a
financial row. Writes go through a savepoint and every error is swallowed:
a diagnostic can never take a trade down with it. `protected` makes `b`
authoritative. The migration
`2026090201_perp_protected_basis.sql` installs `perp_accounting_guard()`:
for legacy/shadow contracts it MIRRORS (`reserve_basis := cost_basis`,
`reserve_basis_delta := cost_basis_delta`), for protected contracts it
REQUIRES the writing transaction to have run
`select set_config('perp.accounting_epoch', '<epoch>', true)` and every row to
be stamped with that epoch, or it raises and the whole transaction rolls back.
A literal old binary never sets the GUC, so it cannot mutate a protected
position, event or funding row — that, not instance draining, is the
enforcement boundary (`backend/scripts/sql/perp-accounting-guard-test.sql`
proves it against the old-writer fixture). The contract row is guarded too
(`perp_accounting_contract_guard()`): a mode/epoch change needs
`perp.accounting_transition`, a strictly advancing epoch and an immutable
`contract_perp_accounting_epochs` record, so a blind flip is impossible; and
any change to `poolLong`/`poolShort` on a contract that is or becomes
protected needs `perp.accounting_epoch` equal to the contract's epoch (the
NEW epoch during activation). A contract-only pool patch — the scheduler's
no-change fast path on an old binary committing a legacy cross-side transfer
— is therefore refused as firmly as a position write. Activation presents
the new epoch before the transition GUC and the contract patch. Price and
halt patches that leave the pools alone are unaffected.
Never mix legacy and protected rows inside one contract: readers normalize
by the contract's mode, and a protected row without `b` fails closed.

**Metrics and events.** `basis-settlement` is excluded from invested/sold
sums, from `lastBetTime`, from the public Trades tab and trade counts (it is
returned only in a single user's history). Period metrics replay it as a
no-op, replay a partial close by its recorded `fraction`, and replay claim
ADL's `c` change like any ADL. Every event carries `reserve_basis_delta`,
`accounting_mode` and `accounting_epoch`; funding summaries carry the epoch.
The contract patch carries `perpBasisDeficit` (Σ(c − b)) and
`perpReducedBasisCount`. Log lines: `[perps][protected] basis settled …`,
`[perps][protected] claim ADL …`, `[perps][accounting] …` for transitions.
Activation with the last-resort allocation writes one `basis-settlement`
per reduced position (`trigger: 'activation'`, `cutoverMark`, epoch), so a
migration-time reduction is as auditable as a settlement-time one.
Basis settlements produce a receipt and a persistent explainer, not a
notification — product must approve any notification treatment separately.

**Workstream B (shadow only).** `perpRiskPolicyMode` (`off | shadow`;
`enforce` is rejected by this build) is independent of the accounting mode.
In `shadow`, every open attempt — accepted, or rejected by the compatibility
gate — is scored (compat vs candidate `U = 1` vs the exact stress rule
`E_d(P*) <= D_opp(P*) + (U/M)·H_opp`) and every oracle/funding tick projects
claim ADL under `alpha ∈ {1, 0.5, 0.1}` (`available = D + alpha·H`). The
latest evaluation is written to `contract_perp_risk_shadow` (one row per
contract, outside the financial event log; nothing is stamped on events) and
the interesting cases are logged as `[perps][risk-shadow]`. None of it can
change an admission, a position, a pool, an event or a payout; a failure
inside the evaluator is logged and ignored. Before any of it is enforced the `H` provenance question (realized
trader losses vs house balance) must be decided — see `risk-policy-shadow.ts`.

**Not implemented, on purpose.** Post-exit capacity deleveraging (Workstream
C). A counterparty's exit never true-closes or scales another user's
position; the incumbent is grandfathered (`q, c, Pe` unchanged, `b` reduced
only to its current value by the realized payout), new exposure is refused
while the gate lacks headroom, and later recovery above `b` is claim-ADL'd
against the backing available then. There is no dormant forced-close path,
event, schema or UI for it.

## Oracle feeds

`backend/shared/src/oracle-feeds.ts` is the registry of known feeds: cadence
(`fast` | `daily`), sanity bounds, staleness threshold, and the required
`marketCreationEnabled` capability. Setting that capability to `false` keeps
ingestion, scheduler health checks, and existing-contract updates running
while both `create-perp` and the admin picker block new markets.

**The registry has no move-size cap, deliberately.** Bounds reject corrupt
data; they do not cap how fast a real value may move. Refusing a point
because it jumped does not make the price correct — the market keeps
executing against the last stored price, which is now knowably wrong — and a
temporal cap cannot self-heal, because the rejected point remains the
comparison basis. Validation that has to tell "corrupt" apart from "moved
fast" belongs in the adapter, where the source is visible: cross-exchange
agreement in `btc-price.ts`, `validateOpenWeightPublication` in
`open-weight-models.ts`, and the per-poll range check in `trump-approval.ts`.

Feed adapters live next to it:

- `btc-price.ts` — BTC/USD spot, median of Coinbase/Kraken/Bitstamp (all
  US-accessible; Binance geo-blocks US IPs).
- `xstocks-price.ts` — tokenized-equity USD prices (SPYx/QQQx/GLDx/NVDAx,
  xStocks by Backed), consensus median across each token's Solana USDC
  pools (Raydium/Orca account state fetched via `solana-rpc.ts`, decoded in
  `common/src/perps/solana-pools.ts`, unit-tested against captured
  accounts). Chain state only — every venue API evaluated came with terms.
- `trump-approval.ts` — 14-day rolling approval average (VoteHub).
- `openrouter-tokens.ts` — trailing seven-day open-weight share of classified
  top-50 OpenRouter model traffic.

**Monotone feeds make bad perps:** a monotone non-decreasing index (the Epoch
Capabilities Index frontier was prototyped and then removed for this reason)
produces a structurally one-sided market with pinned funding and no sound
short thesis. If an ingest-only feed is ever added again, list it in
`PERP_LAUNCH_EXCLUDED_FEED_IDS` in the launch manifest; the preflight
enforces that exclusion.

Backfill scripts
(`backend/scripts/backfill-{btc,xstocks,trump-approval,openrouter}-oracle.ts`)
seed chart history before market creation.

The executable launch set, conservative initial parameters, feed-specific game
design notes, and oracle-latency risks live in
`backend/shared/src/perps/launch-manifest.ts`. Run
`backend/scripts/perp-launch-preflight.ts` at each rollout phase; the operational
sequence and rollback are in `perps-launch-runbook.md`.

## Scheduler

- `update-oracle-feeds.ts` fires **every 5 seconds** (croner handles
  sub-minute fine — see the existing `sports-live` job). It fetches `fast`
  feeds, validates points against the registry, writes `oracle_prices`, and
  applies `runOracleUpdate` to live perps on those feeds. Liquidation + ADL
  always run in the same transaction as the price write — never add a
  price-only update path; closes settle against the cached price.
- `update-perps.ts` runs hourly: oracle updates for `daily`-feed contracts
  (a cheap no-op for fast-feed contracts thanks to the engine's no-change
  fast path), `runFunding` for all, and stale-feed alerting for any live
  contract. The once-per-`FUNDING_PERIOD_MS` funding gate lives INSIDE
  `runFunding`, under the advisory lock, so overlapping ticks can't
  double-fund.
- `update-trump-approval.ts` writes one daily point.
- `update-openrouter-share.ts` polls hourly. OpenRouter currently returns
  complete UTC days, so most hourly observations repeat the same underlying
  value; a fresh timestamp proves job liveness but does not create intraday
  price discovery.

Feed-health alerts are `log.error` lines prefixed `[oracle-feeds]` /
`[update-perps]` — wire GCP log-based alerting to those.

Trading and closes share `getOracleFreshness` from
`common/src/perps/oracle.ts`. A stale price, missing timestamp, or invalid
freshness limit pauses both paths until a valid update arrives; the market page
uses the same predicate to show the pause and disable open/close actions.

The API reads `PERP_TRADING_MODE` on each request:

- `enabled` permits creation, opens, adds, flips, and closes;
- `reduce-only` blocks creation and exposure increases while preserving closes;
- `halted` blocks all user-initiated PERP trading, including closes.

An absent value is `enabled` only when the compiled `PERPS_ENABLED` switch is
true. A false compiled switch cannot be overridden at runtime and remains at
least `reduce-only`; `halted` can tighten it further. An invalid value fails
closed as `halted`. Changing a deployed service's environment requires rolling
its instances. Liquidation, funding, and resolution deliberately remain active
in both incident modes. Use `reduce-only` for ordinary incidents and stale
feeds; use `halted` before investigating a known-corrupt but still-fresh cached
point, because unlisting alone does not block direct API calls.

Oracle rows distinguish the feed-effective `ts`, optional provider
`source_ts`, and immutable Manifold `published_at`. PERP events similarly
distinguish their effective/oracle `ts` from `applied_ts`, the time Manifold
applied the accounting transition. Period metrics use publication/application
time to avoid assigning delayed source data to an earlier reporting period.

## Period metrics

`common/src/perps/metric-periods.ts` is the pure accounting implementation.
For each day/week/month boundary it reverses at most 30 days of events and
calculates:

`period P&L = current value + realized payouts - boundary value - new margin`

The replay covers adds at weighted entry prices, funding, flips, liquidation,
partial and terminal ADL, and settlement. It fails closed on missing prices or
inconsistent history. `profitPercent` divides by boundary value plus new
margin; it is a sorting/reporting return, not a time-weighted return across
capital recycling.

The database event and oracle histories are immutable because changing either
would rewrite reported returns. Legacy rows receive the only defensible
timestamp backfill (`ts`); launch markets must be recreated after the migration
for reliable application/publication timestamps from inception.

Boundary value uses the newest feed-effective oracle point that Manifold had
published by the cutoff; current value uses the contract's cached oracle mark.
The boundary rule is deterministic, but it is not a claim that every contract
had already applied that point: feed publication and per-contract fan-out are
separate transactions and one contract can briefly lag or fail. If reporting
ever needs the historically executable contract price instead, persist
per-contract oracle-application history and value from that record.

## Integration points (grep for these to find everything)

- `outcomeType === 'PERP'` — UI switch branches.
- `contract.mechanism === 'perp'` — backend branches.
- `PERPS_ENABLED` / `PERP_TRADING_MODE` — compiled default and API incident
  control.

The touched files outside this folder are:

- `common/src/contract.ts` — adds the `PERP` outcome and `perp` mechanism.
- `common/src/api/{schema,market-types}.ts` — registers perp endpoints.
- `common/src/calculate-metrics.ts` — pass-through branch (engine is authoritative).
- `common/src/user-notification-preferences.ts`, `notification.ts` — new notif types.
- `backend/api/src/{resolve-market,unresolve}.ts` — perp resolve/block unresolve.
- `backend/api/src/{get-market-loan-max,get-free-loan-available,claim-free-loan,request-loan,get-next-loan-amount}.ts`
  — exclude perps from loans.
- `backend/shared/src/update-user-portfolio-histories-core.ts` — perp PnL branch.
- `backend/shared/src/update-user-metric-periods.ts` — event-based PERP day/week/month
  replay and race-safe `from` updates.
- `backend/shared/src/send-market-movement-notifications.ts` — exclude perps.
- `backend/shared/src/importance-score.ts` — perp scoring branch.
- `backend/scheduler/src/jobs/index.ts`, `update-perps.ts` — schedule wiring.
- `backend/scheduler/src/jobs/update-league.ts` — intentionally excludes PERP
  position P&L from league scoring for launch.
- `web/components/contract/{contract-overview,contracts-table,feed-contract-card}.tsx`,
  `web/components/perps/*`, `web/components/search.tsx`,
  `web/pages/admin/create-perp.tsx` — frontend surface.

PERPs participate in ordinary importance/freshness ranking through committed
24-hour margin volume and distinct recent traders. Daily-movers ranking uses
the absolute 24-hour oracle log return, which is comparable across feeds with
different units. Funding imbalance is not treated as movement, so a flat,
one-sided market does not remain artificially elevated.

## Removal checklist

1. Set `PERP_TRADING_MODE=reduce-only` and roll API instances to reject new
   trades; use `halted` if closes must also stop.
2. Resolve all remaining perp contracts (creator / mod flow settles at oracle).
3. Delete this folder, `common/src/perps/`, `web/components/perps/`,
   `web/pages/admin/create-perp.tsx`.
4. Remove the integration branches listed above (each is flagged with
   `PERP` / `'perp'` for easy grep).
5. Drop the tables created by `backend/supabase/migrations/2026042201_add_perps.sql`:
   `oracle_prices`, `contract_perp_positions`, `contract_perp_events`,
   `contract_perp_funding_events`.
