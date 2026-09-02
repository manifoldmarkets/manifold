# ManiPerp addendum: protected-basis settlement (Workstream A)

Status: DRAFT v0.1 (2026-09-02). Implementation documentation for the
protected-basis accounting mode shipped dormant in the Manifold monorepo.
This is not a change to `web/public/maniperp.pdf`; the paper's original
source and Stephen's sign-off remain external prerequisites for any paper
amendment. Until then this addendum, the engine README and the user-facing
explainer describe the same contract.

## 1. State

A position is `(d, q, c, b, Pe)`. `b` is the protected basis, `0 <= b <= c`.
`c` keeps every role the paper gives it (price PnL, value, leverage,
liquidation, entry economics). At mark `P`:

```
π = ±(P − Pe)/Pe · q          V = max(c + π, 0)
R = min(b, V)                 E = max(V − b, 0)           D = max(b − V, 0)
V = R + E                     b = R + D
```

Per side `d`: pool `B_d`, `C_d = Σb`, `R_d = ΣR`, `E_d = ΣE`, `D_d = ΣD`,
`H_d = B_d − C_d` (unreserved balance; contains subsidy, fees,
liquidation-released basis and realized surplus, so it is not house capital).
Since `B − R = H + D`, the committed-state invariants

```
0 <= b <= c,   B_d >= C_d,   E_long <= D_short + H_short,   E_short <= D_long + H_long
```

say every current contingent claim fits the opposing pool after that pool's
own protected claims are reserved.

## 2. Opening and adding

Margin `m` opens with `c = b = m`. An add raises `c` and `b` by `m`; the
units-weighted entry merge is unchanged. Fees stay outside both bases. New
exposure is admitted by the existing compatibility rule with reserves
`min(b, V)`: `limit = max(U·H_opp + M·D_opp(P), 0) + min(OI_opp, M·ΔD)`,
capped at `M·B_opp`, with `M = U = 10`.

## 3. Funding

Whenever funding scales `q` and `c` by `a`, it scales `b` by `a`. Liquidation
and claim ADL then run at the unchanged mark and the invariants are checked.

## 4. Liquidation and claim ADL

Liquidation removes `q`, `c` and `b`; the margin becomes `H`. Claim ADL
targets `E`:

```
available_d = D_opp + H_opp,   s_d = min(1, available_d / E_d)  (E_d > 0)
q' = s·q,   c' = b + s·(c − b),   b' = b,   Pe' = Pe
```

which maps `E` to `s·E` and reduces to the paper's `q' = s·q, c' = c` at
`b = c`. At `s = 0` the row is removed and `b` is paid once from its own
pool. `originalCostBasis` and fee bases are left alone for `0 < s < 1`. The factor
is representability-aware: an allowance below the side's floating-point
dust snaps `s` to 0 rather than producing a `c'` that rounds above what the
pool can pay, and a contingent claim below dust is left at `s = 1`.

## 5. Loss-first settlement

When a pool pays a realized contingent claim `W`:

```
D = ΣD_i over its underwater rows;  delta = min(W, D)  (0 when D = 0)
delta_i = delta · D_i / D;   b_i' = b_i − delta_i  (never below V_i)
B' = B − W,   C' = C − delta,   D' = D − delta,   H' = H − (W − delta),   R' = R
```

Paper losses are first-loss; `H` funds only the unmatched remainder. The
affected rows keep `q, c, Pe`, value, leverage and liquidation price. The
allocation uses canonical row order and a deterministic residual; aggregate
and partitioned settlement agree within the documented float tolerance
(not bitwise). Every backing check and pool debit uses one shared
affordability predicate, so the invariant and the payout path cannot
disagree about whether a claim is payable.

## 6. Closing

For fraction `z`: own-pool component `z·R`, opposing component `z·E`
(paid after §5 with `W = z·E`), survivor scaled by `1 − z` on
`q, c, b, originalCostBasis, takerFeeCostBasis`. Capacity never rejects a
close. A flip closes first, then validates the new leg; the whole flip is
rejected if the leg does not fit. A partial close must be at least 1% of the
position and must change it; smaller requests are rejected rather than
recorded.

## 7. Resolution and liquidity

Resolution applies liquidation and claim ADL at the terminal mark, reads
every `R` and `E` from one immutable state and pays all positions as one
batch; residual pools follow the existing policy. Liquidity additions raise
`H`; a withdrawal must keep `B >= Σb` and both current-claim inequalities.

## 8. User contract

A basis settlement changes recovery seniority, not current value or
exposure: value up to `b` stays protected by the position's own pool, value
above `b` is contingent on opposing paper losses and unreserved balance and
may be claim-ADL'd. Historical `costBasis` is not guaranteed recoverable
principal after a settlement. No position is force-closed because a
counterparty leaves.

## 9. Out of scope

Workstream B (lower `U`, lower `alpha`, the exact stress rule) is computed in
shadow only. Workstream C (post-exit capacity deleveraging) is not
implemented and has no dormant path.
