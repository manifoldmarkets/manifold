# Free membership days

A reward calls `grantMembershipDays` with a stable user, source and source ID. The private `membership_grants` ledger keeps that receipt after use. Replaying a source returns the original grant. Admin callers supply a stable `key` of 1–100 characters for each award and reuse it on retries.

A banked grant can start when its tier equals or exceeds the current paid tier, including its 25-hour renewal grace. Among eligible grants the highest tier starts first, then the oldest. The total held ahead includes banked durations and the unspent portion of the active grant. `MAX_FREE_MEMBERSHIP_HELD_MS` is 30 days. A partial award records the reduction in its note.

The supporter row is the source of access for every benefit, including margin loans and referral boosts. Starting a grant changes the existing row in place or inserts one if needed. Its expiry is the free end date, its public metadata contains only the grant ID, and automatic renewal is off. Paid tier, signed milliseconds to expiry, original grant time and renewal choice live in private `paused_paid`. A renewal beyond grace still pauses at its paid tier. Its lapsed access allows any free tier to start.

The main scheduler checks every ten minutes. Each user's transition runs in a retried SERIALIZABLE transaction. It ends a due grant and hands the paid snapshot directly to the next eligible grant. Otherwise it restores paid expiry relative to processing time, or removes the supporter row when nothing was paused. If the restored paid row is due for renewal, the same transaction runs the daily scan?s renewal check. It charges the tier price and extends access for 30 days, or turns off renewal if the balance is insufficient. Access can lapse between the free expiry and the scheduler run. The lock lasts until the ledger transition commits.

Membership purchases check the ledger before charging. Free time earns zero upgrade credit. Members can turn off renewal of a paused subscription. The daily expiry notice and membership panel preview the transition at the free end time, including eligible banked grants. When access will end, the notice quotes the mana price to continue. Ordinary shop discounts and freeze limits read the active tier as usual.

Membership notices are best effort. The expiry job records each event in the private `membership_notice_deliveries` table before delivery. A crash or push failure after that commit can leave a notice undelivered. Reruns skip events with a receipt. Only browser notifications occupy inbox space.

Current shop stats count a paused subscriber at their paid tier when paid time remains or automatic renewal is on. The free-day count includes members currently using free access, including those with paid time paused. The historical chart reconstructs past dates from today's entitlement rows, so an in-place tier swap can attribute earlier days to the free tier.

## Future Stripe billing

The mana rail swaps the supporter row. A Stripe rail must also defer the next invoice by each grant's duration, including chained grants. One option is extending `trial_end` with `proration_behavior: 'none'`. Pausing collection alone does not move the billing date. Record the subscription identifiers privately in `paused_paid` and reconcile on resume. Use idempotent billing operations after commit and reconcile failures. Retried SQL callbacks can run more than once. While a grant owns the supporter row, the webhook must update the paused subscription in the ledger. Cancellation must also reach the billing provider.

## Deployment

Apply `2026112503_membership_grants.sql`, deploy the API and main scheduler, then deploy the web client. Issue the first grant only after **every API instance runs the grant-aware version**. An older checkout can credit and delete a grant-owned supporter row. The migration enables RLS and revokes all table privileges from `anon` and `authenticated`. The read endpoint returns the owner's view and the grant endpoint requires an admin ID.

Before rolling back the API, stop issuing grants, stop the grant scheduler and let in-flight grant operations finish. Run the preview and apply commands from the repository root.

```sh
yarn --cwd=backend/scripts ts-node end-active-membership-grants.ts
yarn --cwd=backend/scripts ts-node end-active-membership-grants.ts --apply
```

The preview prints the unserved milliseconds for each active grant. Apply restores the paid row and re-banks any unserved time on the original receipt in one transaction. After it verifies zero active grants, roll back the API. Keep issuance and the grant scheduler stopped until every API instance supports grants again.

A fully capped award persists a zero-duration used receipt, so replaying its source returns the same award. A grant behind a permanent paid membership stays banked until the paid membership ends.
