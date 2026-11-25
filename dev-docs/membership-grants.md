# Free membership days

A reward calls `grantMembershipDays` with a stable user, source and source ID. The private `membership_grants` ledger keeps that receipt after use. Replaying a source returns the original grant. Admin callers supply a stable `key` of 1–100 characters for each award and reuse it on retries.

A banked grant can start when its tier equals or exceeds the current paid tier, including its 25-hour renewal grace. Among eligible grants the highest tier starts first, then the oldest. The total held ahead includes banked durations and the unspent portion of the active grant. `MAX_FREE_MEMBERSHIP_HELD_MS` is 30 days. A partial award records the reduction in its note.

The supporter row is the source of access for every benefit, including margin loans and referral boosts. Starting a grant changes the existing row in place or inserts one if needed. Its expiry is the free end date, its public metadata contains only the grant ID, and automatic renewal is off. The private `paused_paid` snapshot preserves the previous tier, signed milliseconds to expiry, original grant time, renewal choice, enabled flag and metadata. A renewal beyond grace still pauses at its paid tier. Its lapsed access allows any free tier to start.

The main scheduler checks every ten minutes. Each user's transition runs in a retried SERIALIZABLE transaction. It ends a due grant and hands the paid snapshot directly to the next eligible grant. Once the last grant ends, paid time and renewal obligations resume relative to processing time. A non-renewing row that had already lapsed returns with its original absolute expiry. A user who started without a supporter row returns to that state. If the restored paid row is due for renewal, the same transaction runs the daily renewal check. It charges the tier price and extends access for 30 days, or turns off renewal if the balance is insufficient. Access can lapse between the free expiry and the scheduler run. The lock lasts until the ledger transition commits.

Membership purchases check the ledger before charging. Free time earns zero upgrade credit. Members can turn off renewal of a paused subscription. The daily expiry notice and membership panel preview the transition at the free end time, including eligible banked grants. When access will end, the notice quotes the mana price to continue. Ordinary shop discounts and freeze limits read the active tier as usual.

The expiry job checks active free grants with up to three days left. A grant that starts with three days or less sends its free-day notice at activation. When a grant ends and restores paid time with three days or less remaining, the same transaction checks whether the member needs a paid expiry notice. Both paths use the daily scan's notification preferences and commit the receipt in `membership_notice_deliveries` together with any requested inbox row. Broadcast and mobile push are best effort after commit. Later scans skip events with a receipt for that expiry.

Current shop stats count a paused subscriber at their paid tier when paid time remains or automatic renewal is on. The free-day count includes members currently using free access, including those with paid time paused. The historical chart reconstructs past dates from today's entitlement rows, so an in-place tier swap can attribute earlier days to the free tier.

## Future Stripe billing

The mana rail swaps the supporter row. A Stripe rail must also defer the next invoice by each grant's duration, including chained grants. One option is extending `trial_end` with `proration_behavior: 'none'`. Pausing collection alone does not move the billing date. Record the subscription identifiers privately in `paused_paid` and reconcile on resume. Use idempotent billing operations after commit and reconcile failures. Retried SQL callbacks can run more than once. While a grant owns the supporter row, the webhook must update the paused subscription in the ledger. Cancellation must also reach the billing provider.

## Deployment

Apply `2026112503_membership_grants.sql`, deploy the API and main scheduler, then deploy the web client. Issue the first grant only after **every API instance runs the grant-aware version**. An older checkout can credit and delete a grant-owned supporter row. The migration enables RLS and revokes all privileges on both tables and the grant ID sequence from `anon` and `authenticated`. The read endpoint returns the owner's view and the grant endpoint requires an admin ID.

Before rolling back the API, set `MEMBERSHIP_GRANT_STARTS_DISABLED=true` on the API and main scheduler. For GCE, include that line in the `container-env` metadata generated for the API instance template and main scheduler VM on each deploy during rollback. Deploy both services with the switch set. Wait for every instance to finish rolling out and for in-flight operations on the previous version to finish. New awards stay banked, and active grants can still end and restore paid access. From the repository root, preview the rollback and apply it with the switch set in the script's environment.

```sh
yarn --cwd=backend/scripts ts-node end-active-membership-grants.ts
MEMBERSHIP_GRANT_STARTS_DISABLED=true yarn --cwd=backend/scripts ts-node end-active-membership-grants.ts --apply
```

The preview prints the unserved milliseconds for each active grant. Apply restores the paid row and re-banks any unserved time on the original receipt in one transaction. After it verifies zero active grants, roll back the API. Keep the switch set on both services until every API and main scheduler instance is running the version that supports it again.

A fully capped award persists a zero-duration used receipt, so replaying its source returns the same award. A grant behind a permanent paid membership stays banked until the paid membership ends.
