# Prize / Bonus Eligibility Decoupling — Review & Test Handoff

> **Living document.** Updated as testing progresses. Branch: `feat/purchase-unlocks-bonuses`
> (= current `main` incl. #3869 + the decouple stack + the `eligible` layer + audit fixes).
> Status: **implementation complete, audit fixes applied, awaiting local/dev testing.**

| | |
|---|---|
| **Branch** | `feat/purchase-unlocks-bonuses` |
| **Base** | `main` (merge-base = main tip; `git diff main...HEAD` is the clean feature surface) |
| **Surface** | 36 files, ~1.5k insertions |
| **Static checks** | web typecheck ✅ · api typecheck ✅ · `common` tests 121 ✅ |
| **Supersedes** | `origin/sweepstakes-eligibility-decouple` (old iteration — safe to delete) |

---

## 1. The mental model (one sentence)

> One flag (`bonusEligibility`) used to mean **both** "can earn bonuses" **and** "is KYC-verified."
> This stack splits that into **three predicates** and adds a second axis (`prizeEligibility`), so that
> **a purchase or admin grant unlocks bonuses, but only KYC unlocks cash raffles.**

### The three predicates (the whole policy)

| Predicate | Definition | Meaning |
|---|---|---|
| `isIdentityVerified()` | `bonusEligibility ∈ {verified, grandfathered}` | KYC done — **prize-worthy** |
| `canReceiveBonuses()` | `isIdentityVerified() OR bonusEligibility==='eligible'` | earns site/activity bonuses |
| `canEnterPrizeDrawings()` | explicit `prizeEligibility` override, **else** `isIdentityVerified()` | may enter cash raffles |

**The load-bearing invariant:** `canEnterPrizeDrawings`'s fallback derives from `isIdentityVerified`, **not**
`canReceiveBonuses` — so a bonus-only `'eligible'` purchaser can **never** leak into prize drawings.

### `bonusEligibility` state machine

| State | Bonuses? | Prizes (when prize axis unset)? | Set by |
|---|---|---|---|
| `verified` | ✅ | ✅ | iDenfy KYC approval |
| `grandfathered` | ✅ | ✅ | legacy migration (pre-raffles) |
| `eligible` | ✅ | ❌ | **a mana purchase** (card/crypto) or admin grant |
| `ineligible` | ❌ | ❌ | iDenfy denial / admin |
| `requires_verification` | ❌ | ❌ | admin flag (suspected alt) — snapshots prior state |
| `undefined` | ❌ | ❌ | new user |

---

## 2. Logic tree

```
CORE POLICY (common/src/user.ts)
│   isIdentityVerified  = bonusEligibility ∈ {verified, grandfathered}          ← KYC / prize-worthy
│   canReceiveBonuses   = isIdentityVerified  OR  bonusEligibility==='eligible'  ← bonus earning
│   canEnterPrizeDrawings = prizeEligibility override  ELSE  isIdentityVerified  ← cash raffles
│
├── WRITERS — who SETS the fields
│     iDenfy callback ............ KYC approve → verified + prize 'eligible'; deny → underage/generic split
│     purchase webhooks .......... Stripe/Daimo → bonusEligibility 'eligible' (monotonic), never prize
│     admin-set-prize-eligibility  prize axis + optional ticket void/refund
│     admin-flag-for-verification  'requires_verification' (+ snapshot/restore prior state)
│
├── READERS — who ENFORCES the fields
│     PRIZE gates (KYC) .......... buy-tickets · claim-free-ticket · claim-prize · draw    → canEnterPrizeDrawings
│     BONUS gates ................ onboarding next-day bonus · push bonus                   → canReceiveBonuses
│     IDENTITY/CASHOUT gates ..... gidx status · settings · verify page · verify banner     → isIdentityVerified
│
├── LEAK PREVENTION — verificationFlagReason is admin-only
│     toUserAPIResponse (strip public) + websocket broadcast (strip) + get-user-info (admin channel)
│
└── ADMIN UI / SCHEMA / DATA / TESTS
```

---

## 3. Per-file breakdown

### Layer 0 — Core policy & types

#### [`common/src/user.ts`](common/src/user.ts) (+84)
- **Change:** Added `'eligible'` to `bonusEligibility`; added `previousBonusEligibility`; added `prizeEligibility`; added `isIdentityVerified()`; broadened `canReceiveBonuses()`; repointed `canEnterPrizeDrawings()` fallback to `isIdentityVerified`.
- **Does:** Defines the entire policy; the prize fallback uses `isIdentityVerified` so `'eligible'` never reaches prizes.
- **Affects:** Every reader of these predicates (web + backend).
- **Doesn't damage:** For pre-existing values (`verified`/`grandfathered`/`ineligible`/`undefined`), `isIdentityVerified` returns exactly what old `canReceiveBonuses` did → existing behavior unchanged. Proven by legacy tests still passing + new no-leak tests.

#### [`common/src/supporter-config.ts`](common/src/supporter-config.ts) (+24)
- **Change:** `'eligible'` added to tier-resolution unions; `'eligible' → 'verified'` tier.
- **Does:** Purchasers earn quests/streaks/referrals at the full verified multiplier.
- **Affects:** Bonus *amounts*, streak-freeze caps.
- **Doesn't damage:** `requires_verification` still → `unverified` (tested); subscriptions untouched; additive only.

#### [`common/src/txn.ts`](common/src/txn.ts) (+17)
- **Change:** New `SweepstakesTicketRefund` txn type (`SWEEPSTAKES_TICKET_REFUND`, BANK→USER, mana).
- **Does/Affects:** Types the refund in the void flow.
- **Doesn't damage:** Additive union member; `runTxnFromBank` is category-agnostic.

### Layer 1 — Writers (set eligibility)

#### [`backend/api/src/idenfy/callback.ts`](backend/api/src/idenfy/callback.ts) (+70)
- **Change:** Approve → `verified` + `prizeEligibility:'eligible'`; deny → `isUnderageDenial()` split: underage → `prizeEligibility:'ineligible'` only (bonuses untouched); generic → block bonuses (preserve grandfathered) **and** pin `prizeEligibility:'ineligible'`.
- **Does:** KYC is the only path to prizes; underage keeps mana bonuses, loses raffles.
- **Affects:** Both axes per KYC result; the retroactive M500 + referral payout (unchanged, KYC-only).
- **Doesn't damage:** Inside the existing `SERIALIZABLE` retry tx (dedup preserved). Generic-denial prize pin is **load-bearing** for grandfathered users (documented). Underage no longer wrongly upgrades `undefined→verified`.

#### [`common/src/idenfy-helpers.ts`](common/src/idenfy-helpers.ts) (+60) & [`.test.ts`](common/src/idenfy-helpers.test.ts) (+155)
- **Change:** Pure `isUnderageDenial()` — DOB age math + anchored reason-regex, fail-closed.
- **Affects:** Only the callback's deny branch.
- **Doesn't damage:** Fully unit-tested incl. `AGE`-substring false-positive guard; returns `false` when unsure → safer generic branch.

#### [`backend/api/src/stripe-endpoints.ts`](backend/api/src/stripe-endpoints.ts) (+9) & [`daimo-webhook.ts`](backend/api/src/daimo-webhook.ts) (+9)
- **Change:** After the purchase txn, call `recordManaPurchase(tx, userId)`. (Stale `canReceiveBonuses` checkout gate removed via the main merge / #3869.)
- **Does:** Completed purchase flips `undefined → 'eligible'`.
- **Doesn't damage:** Monotonic — only promotes from unset; never overrides `ineligible`/`requires_verification` or downgrades `verified`/`grandfathered`; never touches `prizeEligibility`; never pays M500. In the same money tx (atomic).

#### [`backend/shared/src/supabase/users.ts`](backend/shared/src/supabase/users.ts) (+23)
- **Change:** New `recordManaPurchase()` helper (de-duplicated promotion logic).
- **Doesn't damage:** Byte-identical to the prior inline blocks — pure refactor; typecheck confirms call sites.

#### [`backend/api/src/admin-set-prize-eligibility.ts`](backend/api/src/admin-set-prize-eligibility.ts) (+130, new)
- **Change:** Set `prizeEligibility`; optional `voidOutstandingTickets`+`reason` → void unresolved-drawing tickets (`voided_at`/`voided_reason`) + refund mana, in one `pg.tx`.
- **Affects:** `prizeEligibility`, `sweepstakes_tickets`, balances.
- **Doesn't damage:** Atomic; `FOR UPDATE OF t`; resolved drawings untouched; free tickets voided but not refunded; clear falls back to identity verification.

#### [`backend/api/src/admin-flag-for-verification.ts`](backend/api/src/admin-flag-for-verification.ts) (+84, new)
- **Change:** Flag → `requires_verification` + **snapshot prior `verified`/`grandfathered`/`eligible`** into `previousBonusEligibility`; clear → **restore** it (else undefined); returns resulting state.
- **Doesn't damage:** flag→clear is now lossless; doesn't touch `prizeEligibility`; blocks flagging admins.

#### [`backend/api/src/routes.ts`](backend/api/src/routes.ts) (+4)
- **Change:** Registers the two new admin endpoints. Additive only.

### Layer 2 — Readers (enforce eligibility)

**Prize gates → `canEnterPrizeDrawings` (KYC required):**
- [`buy-sweepstakes-tickets.ts`](backend/api/src/buy-sweepstakes-tickets.ts) (+12) — entry gate `canReceiveBonuses → canEnterPrizeDrawings`; bonding-curve SUM filters `voided_at IS NULL`.
- [`claim-free-sweepstakes-ticket.ts`](backend/api/src/claim-free-sweepstakes-ticket.ts) (+4) — entry gate → `canEnterPrizeDrawings`.
- [`claim-sweepstakes-prize.ts`](backend/api/src/claim-sweepstakes-prize.ts) (+28) — re-check at claim time + `voided_at` filter.
- [`backend/shared/src/sweepstakes.ts`](backend/shared/src/sweepstakes.ts) (+57) — draw-time JS exclusion + **guard: `throw` if zero eligible tickets** (prevents empty, re-runnable result).
- **Doesn't damage:** Three independent layers (entry/draw/claim); `'eligible'` purchasers correctly excluded everywhere.

**Bonus gates → `canReceiveBonuses` (purchasers included):**
- [`onboarding-helpers.ts`](backend/shared/src/onboarding-helpers.ts) (+5) (next-day bonus) & [`push-token.ts`](backend/api/src/push-token.ts) (+3) (push bonus) — same predicate, broadened meaning; comments updated.
- **Doesn't damage:** Intended; `ineligible`/`requires_verification` still excluded.

**Identity/cashout gates → `isIdentityVerified` (stay KYC-only):**
- [`common/src/gidx/user.ts`](common/src/gidx/user.ts) (+7) — cashout/sweeps status gate.
- [`settings.tsx`](web/components/profile/settings.tsx) (+6), [`identity-verification-page.tsx`](web/components/onboarding/identity-verification-page.tsx) (+14), [`verify-phone-number-banner.tsx`](web/components/user/verify-phone-number-banner.tsx) (+7) — the verify-identity UI, so purchasers still see the KYC path.
- [`prize.tsx`](web/pages/prize.tsx) (+4) — uses `canEnterPrizeDrawings`.
- **Doesn't damage:** Reproduces exact pre-broadening behavior for KYC states; keeps the KYC entry point visible to `'eligible'` users; a purchaser **cannot** cash out.

### Layer 3 — Leak prevention (`verificationFlagReason` admin-only)

- [`common/src/api/user-types.ts`](common/src/api/user-types.ts) (+9) — `toUserAPIResponse` strips it (public REST).
- [`backend/shared/src/websockets/helpers.ts`](backend/shared/src/websockets/helpers.ts) (+6) — `broadcastUpdatedUser` strips it (websocket).
- [`backend/api/src/admin-get-user-info.ts`](backend/api/src/admin-get-user-info.ts) (+3) — serves it through the admin-gated endpoint, re-hydrated on the admin page.
- **Doesn't damage:** All other FullUser fields preserved; only the admin UI ever read this field and it still gets it via the admin path.

### Layer 4 — Admin UI / Schema / Data

- [`web/pages/admin/user-info.tsx`](web/pages/admin/user-info.tsx) (+417) — Bonus + Prize sections, Flag section, `'eligible'` option, corrected prize-fallback copy, flag-reason re-hydration, handlers use returned state.
- [`web/components/moderation/ban-modal.tsx`](web/components/moderation/ban-modal.tsx) (+29) — badge renders `eligible`/`requires_verification` distinctly.
- [`web/pages/admin/new-users.tsx`](web/pages/admin/new-users.tsx) (+29) — `'eligible'` selectable; flagged shown as "Requires verification".
- [`verification-required-modal.tsx`](web/components/modals/verification-required-modal.tsx) (+17) — distinct "flagged for review" copy.
- [`common/src/api/schema.ts`](common/src/api/schema.ts) (+67) — endpoint defs + return types (`'eligible'` in unions, `verificationFlagReason` on admin endpoint, flag endpoint returns resulting state).
- [`migrations/2026060701_sweepstakes_tickets_voided.sql`](backend/supabase/migrations/2026060701_sweepstakes_tickets_voided.sql) (+22) + [`sweepstakes_tickets.sql`](backend/supabase/sweepstakes_tickets.sql) (+9) — `voided_at`/`voided_reason` columns.
- **Doesn't damage:** Local UI state unions match API enums (typecheck-enforced). `bonusEligibility`/`prizeEligibility` live in `users.data` JSONB → **no column migration**, so the branch does **not** depend on the old branch's orphaned `2026052601` migration.

### Layer 5 — Tests & chore
- [`common/src/user.test.ts`](common/src/user.test.ts) (+239) & [`idenfy-helpers.test.ts`](common/src/idenfy-helpers.test.ts) (+155) — encode no-leak, monotonic-promotion, fail-closed, underage-keeps-bonuses, tier, axis-independence. **121 tests pass.**
- [`.gitignore`](.gitignore) (+4) — untrack the stray scheduler lock.

---

## 4. Audit fixes applied (multi-agent audit → fixes)

| # | Finding | Fix |
|---|---|---|
| #1/#2/#6 🔴 | Stale base re-contained the card-purchase gate | Merged `main` — #3869's gate removal inherited cleanly |
| #4/#7 🟠 | `verificationFlagReason` leaked (websocket + public API) | Stripped from `toUserAPIResponse` + broadcast; admin-only via `get-user-info` |
| #5/#9 🟠 | Flag-for-verification destroyed prior bonus state | Snapshot + restore on clear; endpoint returns resulting state |
| #3 🟠 | All-ineligible draw wrote `[]` → re-runnable | `throw` when zero eligible tickets |
| #8 🟠 | Admin copy said prize fallback derives from bonus | Corrected to identity verification; fixed load-bearing comment |
| — | Stale comments (3 files) | Corrected to `isIdentityVerified` |
| — | Duplicated Stripe/Daimo promotion block | Extracted `recordManaPurchase` |
| — | Admin UI gaps | `eligible` in new-users; distinct ban-modal badges |
| — | Stray lock file + test gaps | Untracked + gitignored; added tier + axis tests |

---

## 5. Test plan

> Tick as completed. Add notes/results inline or in §6.

### 0. Static (re-run to confirm)
- [ ] `yarn typecheck:web` · `yarn typecheck:api` · `yarn --cwd common jest`
- [ ] Apply migration on dev; confirm `sweepstakes_tickets` has `voided_at`, `voided_reason`

### 1. Purchase → bonus unlock, NOT prizes (headline flow)
- [ ] New unverified account → buy mana with **credit card** (Stripe) completes (no 403); `bonusEligibility` becomes `eligible`; quests/streaks pay at verified rate; **`/prize` still says "verify to enter"**
- [ ] Same with **crypto** (Daimo)
- [ ] Buy a second time → still `eligible`, no M500 paid, no double-effect

### 2. KYC verify → both axes + M500
- [ ] Unverified (or `eligible`) user passes iDenfy → `verified` + `prizeEligibility:eligible`; M500 paid once; `/prize` now allows entry

### 3. Underage / generic denial
- [ ] iDenfy deny under-18 → bonuses kept (or stay unset for new user); `prizeEligibility:ineligible`; `/prize` blocked
- [ ] Generic denial on a **grandfathered** user → loses prize access (proves the load-bearing pin) and bonuses blocked

### 4. Admin flag → clear is lossless (verify carefully)
- [ ] Flag a **verified** user (with reason) → `requires_verification`, bonuses off → **Clear** → back to **`verified`**, bonuses restored
- [ ] Flag an **`eligible`** purchaser → Clear restores `eligible`

### 5. Admin prize-ineligible + void/refund
- [ ] User holds tickets in an unresolved drawing → admin set prize **Ineligible** + void → tickets get `voided_at`, mana refunded, next-buyer bonding-curve price reflects removal

### 6. Draw-time guard
- [ ] Make all ticket holders ineligible, run draw → **throws / writes nothing** (re-runnable), no empty winner set recorded

### 7. Privacy (security fix) — explicit
- [ ] Flag a user with reason "test-secret", then `curl /api/v0/user/<username>` → **no** `verificationFlagReason`
- [ ] As the flagged user in-browser, watch websocket → reason never arrives
- [ ] As **admin** on `/admin/user-info` → reason **is** visible

### 8. Admin UI display
- [ ] `/admin/user-info`, `/admin/new-users`, ban-modal: every `bonusEligibility` state shows a distinct correct label/color; prize section says "derives from **identity verification**"

### 9. Cashout safety
- [ ] An `eligible` purchaser (no KYC) **cannot** start a sweeps cashout (gidx status = "must verify identity")

---

## 6. Test results / notes

_(fill in as we go)_

| Date | Scenario | Result | Notes |
|---|---|---|---|
| | | | |

---

## 7. Deferred (low-priority, from the audit)

- **TOCTOU** in webhook promotion/claim at Read-Committed — very low risk given the monotonic "promote only from unset" guard; would need `SERIALIZABLE` to fully close.
- **Backend integration tests** for webhook promotion + flag→clear server round-trip — needs a DB harness; predicate-level invariants covered in `common`.
- **Draw-time eligibility in-memory** (`getUsers`) vs SQL — necessary (the `undefined→isIdentityVerified` fallback isn't expressible in flat SQL); scale cost negligible.

## 8. Merge checklist

- [ ] Test plan §1–9 pass on dev
- [ ] Decide on backfill of existing purchasers (`purchasedMana=true`, `bonusEligibility` unset → `eligible`; ~33 prod users, 9 `ineligible` correctly excluded)
- [ ] Delete superseded `origin/sweepstakes-eligibility-decouple`
- [ ] Final rebase/merge of latest `main`; re-run static checks
- [ ] Open PR / request review
