# Free membership days

A reward calls `grantMembershipDays` with a stable user, source and source ID. The private `membership_grants` ledger keeps that receipt after use. Replaying a source returns the original grant. Admin support grants use a fresh ID for each request.

A banked grant can start when its tier equals or exceeds the current paid tier, including its 25-hour renewal grace. Among eligible grants the highest tier starts first, then the oldest. The total held ahead includes banked durations and the unspent portion of the active grant. `MAX_FREE_MEMBERSHIP_HELD_MS` is 30 days. A partial award records the reduction in its note.

The supporter row is the source of access for every benefit, including margin loans and referral boosts. Starting a grant changes the existing row in place or inserts one if needed. Its expiry is the free end date, its public metadata contains only the grant ID, and automatic renewal is off. Paid tier, remaining milliseconds, original grant time and renewal choice live in private `paused_paid`.

The main scheduler checks every ten minutes. Each user's transition runs in a retried SERIALIZABLE transaction. It ends a due grant and hands the paid snapshot directly to the next eligible grant. Otherwise it restores paid expiry relative to processing time, or removes the supporter row when nothing was paused. Restoring zero remaining time with renewal enabled makes the row due for the normal mana renewal job. Access can lapse between the free expiry and the scheduler run. The lock lasts until the ledger transition commits.

Membership purchases check the ledger before charging. Free time earns zero upgrade credit. Members can turn off renewal of a paused subscription. The daily expiry notice names the resuming paid tier or quotes the mana price to continue. Ordinary shop discounts and freeze limits read the active tier as usual.

## Future Stripe billing

The mana rail swaps the supporter row. A Stripe rail must also defer the next invoice by each grant's duration, including chained grants. One option is extending `trial_end` with `proration_behavior: 'none'`. Pausing collection alone does not move the billing date. Record the subscription identifiers privately in `paused_paid` and reconcile on resume. Use idempotent billing operations after commit and reconcile failures. Retried SQL callbacks can run more than once. While a grant owns the supporter row, the webhook must update the paused subscription in the ledger. Cancellation must also reach the billing provider.

## Deployment

Apply `2026112503_membership_grants.sql`, deploy the API and main scheduler, then deploy the web client. The migration enables RLS with no public policies. Only the authenticated owner's view is returned by the read endpoint. The admin endpoint requires an admin ID.

Two design decisions are open before deployment. The specified positive-duration constraint cannot store the required zero-duration used receipt at the cap. That award currently rolls back. A permanent paid row has no finite remaining duration. An attempt to pause it also rolls back, preserving its access.
