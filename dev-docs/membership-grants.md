# Free membership days

A reward calls `grantMembershipDays` with a stable user, source and source ID. The private `membership_grants` ledger keeps that receipt after use. Replaying a source returns the original grant. Admin callers supply a stable `key` of 1–100 characters for each award and reuse it on retries. `grantMembershipDays` takes the user's `betsQueue` slot, so call it before entering that slot, never from inside it.

A banked grant can start when its tier equals or exceeds the current paid tier, including its 25-hour renewal grace. Among eligible grants the highest tier starts first, then the oldest. The total held ahead includes banked durations and the unspent portion of the active grant. `MAX_FREE_MEMBERSHIP_HELD_MS` is 30 days. A partial award records the reduction in its note.

The supporter row is the source of access for every benefit, including margin loans and referral boosts. Starting a grant changes the existing row in place or inserts one if needed. Its expiry is the free end date, its public metadata contains only the grant ID, and automatic renewal is off. The private `paused_paid` snapshot preserves the previous tier, signed milliseconds to expiry, original expiry timestamp, original grant time, renewal choice, enabled flag and metadata. A renewal beyond grace still pauses at its paid tier. Its lapsed access allows any free tier to start.

The main scheduler checks every two minutes. It scans expired grants and users with at least one banked grant eligible under their current supporter row. With starts paused, it scans only expired grants. Each user's transition runs in a retried SERIALIZABLE transaction. It ends a due grant and hands the paid snapshot directly to the next eligible grant. Once the last grant ends, paid time and renewal obligations resume relative to processing time. If the paid row was already overdue when paused and renewal is off at restoration, it returns with its original absolute expiry. This also applies when renewal was cancelled during the free days. A user who started without a supporter row returns to that state. If the restored paid row is due for renewal, the same transaction runs the daily renewal check. It charges the tier price and extends access for 30 days, or turns off renewal if the balance is insufficient and starts any newly eligible banked grant. Checkout and the owner's grant view also settle an expired grant on demand. Other benefit reads can see a gap until the next transition. The lock lasts until the ledger transition commits.

Membership purchases check the ledger before charging and again after writing the purchased tier. A grant unlocked by a downgrade starts immediately and sets aside the entire purchased duration. Free time earns zero upgrade credit. Members can turn off renewal of a paused subscription. The daily expiry notice and membership panel preview the transition at the free end time, including eligible banked grants. When access will end, the notice quotes the mana price to continue. Ordinary shop discounts and freeze limits read the active tier as usual.

The expiry job checks active free grants with up to three days left. A grant that starts with three days or less sends its free-day notice at activation. When a grant ends and restores paid time with three days or less remaining, the same transaction checks whether the member needs a paid expiry notice. Both paths use the daily scan's notification preferences and commit the receipt in `membership_notice_deliveries` together with any requested inbox row. Broadcast and mobile push are best effort after commit. Later scans skip events with a receipt for that expiry.

Current shop stats count a paused subscriber at their paid tier when paid time remains or automatic renewal is on. The free-day count includes members currently using free access, including those with paid time paused. The historical chart reconstructs past dates from today's entitlement rows, so an in-place tier swap can attribute earlier days to the free tier.

## Future Stripe billing

The mana rail swaps the supporter row. A Stripe rail must also defer the next invoice by each grant's duration, including chained grants. One option is extending `trial_end` with `proration_behavior: 'none'`. Pausing collection alone does not move the billing date. Record the subscription identifiers privately in `paused_paid` and reconcile on resume. Use idempotent billing operations after commit and reconcile failures. Retried SQL callbacks can run more than once. While a grant owns the supporter row, the webhook must update the paused subscription in the ledger. Cancellation must also reach the billing provider.

## Deployment

Apply `2026112503_membership_grants.sql`. If its five-second lock timeout fires, rerun the entire migration after the conflicting lock clears. Deploy the API and main scheduler, followed by the web client. Issue the first grant only after **every API instance runs the grant-aware version**. An older checkout can credit and delete a grant-owned supporter row. The migration enables RLS and revokes all privileges on both tables and the grant ID sequence from `anon` and `authenticated`. The read endpoint returns the owner's view and the grant endpoint requires an admin ID.

Before rolling back the API, pause starts across all grant-aware services with one SQL statement. The migration seeds the switch as enabled. A missing row also enables starts.

```sql
insert into
  system_trading_status (token, status)
values
  ('MEMBERSHIP_GRANTS', false) on conflict (token) do
update
set
  status = excluded.status;
```

The database switch takes effect without a deploy. New awards stay banked, and active grants can still end and restore paid access. From the repository root, preview the rollback and then apply it. Apply requires the switch row to be present and false.

```sh
yarn --cwd=backend/scripts ts-node end-active-membership-grants.ts
yarn --cwd=backend/scripts ts-node end-active-membership-grants.ts --apply
```

The preview prints the unserved milliseconds for each active grant. Apply restores the paid row and re-banks any unserved time on the original receipt in one transaction. After it verifies zero active grants, roll back the API. Leave starts paused until every API and main scheduler instance supports grants again. Run the same SQL statement with `true` to resume starts.

A fully capped award persists a zero-duration used receipt, so replaying its source returns the same award. A grant behind a permanent paid membership stays banked until the paid membership ends.
