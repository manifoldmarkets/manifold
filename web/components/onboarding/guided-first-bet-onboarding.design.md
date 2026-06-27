# Design doc: Guided first-bet onboarding

**Status:** Proposed · **Author:** _(assign)_ · **Created:** 2026-06-26
**Reviewers:** _(eng, growth)_
**Tracking issue:** _(link)_

> Co-located with the welcome flow it modifies (`web/components/onboarding/welcome.tsx`). Source of the problem statement: the June 2026 New-User Behaviour analysis (`C:\Users\tod\manifold-analysis\new-user-analysis-2026-06.md`).

---

## 1. Summary

End the signup/welcome flow on a **real first bet**: after the topic-selection step, show the new user one curated, live, high-relevance market with the bet/answer panel **pre-opened** and their signup bonus already in their balance, and let them place a first prediction in-flow. Placing the bet (or skipping) completes onboarding.

This is a frontend-led change to the existing welcome modal plus one small backend endpoint to pick the market. The betting components already support everything we need.

## 2. Why (evidence)

From the new-user analysis (all prod, last 90 days unless noted):

- **~70% of new users never place a single real bet** — activation is the dominant leak, dwarfing every other problem. _(§A)_
- **First-bet is a minutes-long decision or never:** median time-to-first-bet **3.3 min**, **94% of bettors bet within 24 h**, only ~0.9% ever first-bet after day 1. The first session is the whole game. _(§D)_
- **The trade panel already converts ~89–96%** — the bottleneck is getting users _to_ it, not the bet UX. ~26% never fire `welcome screen: landed`; ~31% of those who do never open a panel. _(§B, §E)_
- **Commitment predicts retention:** moving a user from "no day-0 action" (1.2% ever-return) to "placed a bet" (30.3% ever-return) is the single biggest lever we have. _(§C)_
- **What converts is live, news-driven content** (sports/World Cup, US politics), almost entirely BINARY / MULTIPLE*CHOICE markets. *(§G)\_

A guided first bet attacks all of these at once: it forces the welcome→panel transition (the leak), on the content that converts, inside the minutes-long window when intent is highest.

## 3. Goals / non-goals

**Goals**

- Increase the share of new users who place a first real bet (primary activation metric).
- Reduce time-to-first-bet.
- Do it without harming D1/D7 retention or generating junk bets.

**Non-goals**

- Native mobile app onboarding (the `mani/` / React Native client). Native already activates _better_ than web (57.7% vs 35.1%, §K), and web is where 73% of newcomers land — so **scope v1 to web**. A native follow-up can reuse the endpoint.
- KYC/identity changes. The pre-KYC bonus already funds a first bet, so the first bet can precede verification.
- Changing the bet/economy backend.

## 4. Success metrics & experiment

Ship behind an A/B test using the existing `useABTest` hook (`web/hooks/use-ab-test.ts`).

```ts
const variant = useABTest('guided-first-bet-onboarding', ['control', 'guided'])
```

| Metric                            | Definition                                                                                                     | Target        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------- |
| **Primary: first-bet activation** | % of new users with a real bet (`is_redemption=false, is_api=false, is_cancelled=false`) within 24 h of signup | ↑ vs control  |
| Time-to-first-bet                 | median minutes signup → first real bet                                                                         | ↓ vs control  |
| **Guardrail: D1/D7 retention**    | real bet on offset 1–2 / 6–8 days                                                                              | no regression |
| **Guardrail: bet quality**        | % of onboarding first bets cancelled/sold within 5 min                                                         | not elevated  |
| Onboarding completion             | % reaching `welcome screen: complete`                                                                          | no regression |

Measurement uses the existing `user_events` + `contract_bets` pipeline (see §8). Decision after the cohort reaches D7 maturity.

## 5. UX flow

**Current welcome flow** (`Welcome()` in welcome.tsx:38, pages from `availablePages` welcome.tsx:78-98):

```
0 WhatIsManifold → 1 NameInput → 2 PredictionMarket(how it works) → 3 Topics → 4 IdentityVerification → done
```

**Proposed** (insert one page after Topics):

```
0 WhatIsManifold → 1 NameInput → 2 How it works → 3 Topics → 4 FirstBet (NEW) → 5 IdentityVerification → done
```

**FirstBet page behaviour:**

1. On mount, call the new endpoint with the user's just-selected topics → get one market.
2. Render the market header (question + a sentence of context) and an embedded `BuyPanel` with the panel body **pre-opened** (binary: `initialOutcome` set; multi-choice: `multiProps` with a highlighted answer).
3. A small default amount is pre-filled (e.g. M$10–M$50) with the balance shown ("You have M$X to play with").
4. **Place bet → `onBuySuccess` advances to IdentityVerification** (or finishes). Show a brief success state ("You're in! 🎉").
5. **"Skip for now"** secondary button advances without betting (don't trap users who won't bet — but make betting the default, prominent path).

## 6. Implementation

### 6.1 Frontend — new onboarding page

**File:** `web/components/onboarding/welcome.tsx`

- Add a new `<FirstBetPage>` into `availablePages` between `TopicsPage` (index 3) and `IdentityVerificationPage` (welcome.tsx:78-98). Gate it on the A/B variant so `control` keeps the current 5-page flow.
- Update `showBottomButtons` (welcome.tsx:100) — FirstBetPage manages its own buttons like Topics/Identity do, so the condition becomes effectively "page < 3" still (FirstBet and the two pages after it self-manage).
- Add tracking branches in `handleSetPage` (welcome.tsx:48) for the new page index.
- Wire `onBuySuccess`/skip to `increasePage` (welcome.tsx:166).

**New component:** `web/components/onboarding/first-bet-page.tsx`

```tsx
export function FirstBetPage(props: {
  user: User
  onNext: () => void
  goBack: () => void
}) {
  const { user, onNext } = props
  const [market, setMarket] = useState<Contract | null>(null)

  useEffect(() => {
    track('first-bet onboarding: shown') // new event
    api('get-onboarding-market', {}).then(setMarket) // endpoint reads the user's topic interests server-side
  }, [])

  if (!market) return <LoadingFirstMarket /> // skeleton; never block the flow on this

  const isMulti = market.outcomeType === 'MULTIPLE_CHOICE'
  return (
    <Col>
      <FirstMarketHeader contract={market} />
      <BuyPanel
        contract={market as MarketContract}
        inModal
        location="onboarding first bet" // distinct location for analytics
        initialOutcome={isMulti ? undefined : 'YES'} // pre-opens the panel (bet-panel.tsx:138-143)
        multiProps={isMulti ? buildMultiProps(market) : undefined}
        onBuySuccess={() => {
          track('first-bet onboarding: bet placed', { contractId: market.id })
          onNext()
        }}
      />
      <Button
        color="gray-white"
        onClick={() => {
          track('first-bet onboarding: skipped')
          onNext()
        }}
      >
        Skip for now
      </Button>
    </Col>
  )
}
```

**Why this works with existing code (verified):**

- `BuyPanel` (bet-panel.tsx:108) already accepts `initialOutcome`, and its `useEffect` sets `isPanelBodyVisible = true` when `initialOutcome` is provided (bet-panel.tsx:138-143) — i.e. passing an outcome **auto-opens the panel**. No new prop needed for binary.
- `BuyPanel` already takes `onBuySuccess` (bet-panel.tsx:88) and `location` (bet-panel.tsx:90) and `inModal` (bet-panel.tsx:110).
- Multi-choice is supported via `multiProps?: MultiBetProps` (bet-panel.tsx:87). Most new-user first bets are multi-choice/sports (§G), so handle both; for multi, pre-select/scroll-to the top answer rather than `initialOutcome`.
- **(Verify)** a clean default-amount prop. `BuyPanel` manages amount in internal state; there isn't an obvious `initialAmount` prop today. Either add one (small, localized change) or accept the panel's existing default. Pre-filling a small amount is recommended but optional for v1.

### 6.2 Backend — market selection endpoint

**New endpoint:** `get-onboarding-market` (add to `common/src/api/schema.ts` and `backend/api/src/get-onboarding-market.ts`; register in the API router).

Returns **one** market for the calling user. Reuse the curation logic in `backend/api/src/get-feed.ts` (`getFeed`) and the scoring in `backend/shared/src/importance-score.ts` rather than reinventing — constrain it to a single best result.

**As built** — a shared quality + resolution-clarity filter, ranked by `importance_score desc`, run in a 4-tier fallback. Returns `{ market: Contract | null }`.

Quality + clarity filter (every tier):

1. **Open, with runway:** `resolution_time is null`, `close_time > now() + 2h` (so it can't resolve mid-onboarding), `visibility='public'`, `deleted=false`, `token='MANA'`.
2. **Easy to understand:** `outcome_type in ('BINARY','MULTIPLE_CHOICE')` (~98% of first bets; they convert — §G).
3. **A real call to make:** binary `prob` in 0.1–0.9; multiple-choice restricted to `cpmm-multi-1` and skipped if its favorite answer is already ≥0.9 (the UI pre-selects the top answer, so it shouldn't be near-certain).
4. **Straightforward resolution:** exclude markets with an unresolved `pending_clarifications` request, or an open `mod_reports` (status `new` / `under review` / `needs admin`).
5. **A real crowd:** `unique_bettor_count >= MIN_TRADERS`.

Tiered fallback (first hit wins; `{market:null}` only if nothing qualifies → the step self-skips):

1. topic-matched (groups the user just followed, via `group_members`) + `MIN_TRADERS_STRICT` (25)
2. topic-matched + `MIN_TRADERS_RELAXED` (5)
3. global + 25
4. global + 5

Validated on prod: typical pick is a well-traded, in-band, current market; the topic tier returns topic-relevant markets; ~250–420 ms typical (≈1.3 s only in the pathological all-miss case). Possible future tightening (not done): reuse `minimumContractsQualityBarWhereClauses`, actively prefer auto-resolving sports / trusted-creator markets, add an index backing the importance ordering over the filter.

### 6.3 Signup bonus — already handled

No backend work. The bonus is granted on user creation (`backend/shared/src/create-user-main.ts`) using constants in `common/src/economy.ts` (`PRE_KYC_STARTING_BALANCE` / `STARTING_BALANCE`), so a new user already has a spendable balance when they reach the FirstBet page. **(Verify the exact current amount** — code constants read 500, but the analysis saw a modal SIGNUP_BONUS of M$100 with a M$1,000 tier; reconcile before choosing the default first-bet amount.)\*\* Just display the real balance and pre-fill a small fraction of it.

### 6.4 Analytics

Fire via the existing `track()` (`web/lib/service/analytics.ts`):

- `first-bet onboarding: shown` `{ contractId }`
- `first-bet onboarding: bet placed` `{ contractId, amount, outcome }`
- `first-bet onboarding: skipped`
- Existing `bet intent` and `bet` events fire automatically from `BuyPanel` with `location: 'onboarding first bet'` — so the funnel is measurable with the data we already collect.

> ⚠️ Per-user `user_events` analysis is currently throttled by a missing index (see the analysis playbook). It does not block this feature, but add the `user_events (user_id, name, ts)` index if you want to measure the new funnel cleanly post-launch.

## 7. Edge cases

| Case                                         | Handling                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Endpoint slow / errors                       | Show a skeleton; if it fails, auto-skip the page (never block onboarding).            |
| No market matches topics                     | Fallback to global top-importance MANA market.                                        |
| User skipped topic selection                 | Use global trending fallback.                                                         |
| Market closes/resolves between fetch and bet | `BuyPanel` already guards closed markets; on error, refetch a new market.             |
| User on native app                           | Out of scope v1 (web only); endpoint is reusable later.                               |
| Insufficient balance                         | Shouldn't happen (bonus pre-loaded); default amount must be ≤ balance.                |
| Embeds / twitch / non-/home entry            | Only run when the welcome modal runs (`shouldShowWelcome`); inherits existing guards. |

## 8. Rollout

1. **Phase 0:** add the `user_events` index (optional but recommended) so the funnel is measurable.
2. **Phase 1:** ship behind `useABTest('guided-first-bet-onboarding', ['control','guided'])` at a small allocation. Watch primary activation + bet-quality guardrail daily; D1 within days.
3. **Phase 2:** if activation ↑ with no retention/quality regression, ramp to 50/50, then default-on.
4. **Phase 3:** port to native app (which already converts better — likely additive).

## 9. Open questions

- Default first-bet amount, and do we add an `initialAmount` prop to `BuyPanel`? Reconcile the M$500 code constant vs the M$100/M$1000 observed grants first.
- In-modal embedded market (this proposal) vs. redirect-to-market-page-with-panel-open (`?betOpen=YES`). In-modal is recommended (contained, measurable, can't get lost); redirect would need new query-param support on the contract page.
- Should a successful first bet auto-follow the market? (Following correlates with retention, §I — cheap add.)
- Multi-choice UX: which answer to pre-highlight (top by prob? most-traded?).
- Do we let users pick from 2–3 curated markets instead of one? (More choice vs. the shallow-browse-depth finding in §D suggests _fewer_ choices — lean single market.)

## 10. File-touch checklist

- [ ] `common/src/api/schema.ts` — add `get-onboarding-market` schema
- [ ] `backend/api/src/get-onboarding-market.ts` — new endpoint (reuse get-feed/importance-score logic)
- [ ] register endpoint in the API router
- [ ] `web/components/onboarding/first-bet-page.tsx` — new component
- [ ] `web/components/onboarding/welcome.tsx` — insert page into `availablePages`, update `handleSetPage` + `showBottomButtons`, A/B gate
- [ ] `web/components/bet/bet-panel.tsx` — (optional) add `initialAmount` prop
- [ ] `web/hooks/use-ab-test.ts` — register the experiment name (used inline)
- [ ] analytics — new `first-bet onboarding: *` events (no code change beyond `track()` calls)
- [ ] (recommended) DB migration: `CREATE INDEX CONCURRENTLY user_events_user_id_name_ts ON user_events (user_id, name, ts DESC)`

---

_All file paths and component/prop names above were checked against the repo on 2026-06-26; items marked **(Verify)** should be confirmed by the implementing dev._
