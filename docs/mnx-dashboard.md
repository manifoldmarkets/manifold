# MNX market management

Open `/admin/mnx` while signed in as the configured MNX account or an admin.
There is also a link on `/perps` for those accounts and on the admin index.
Deploy the API and web changes before using the dashboard. No database migration
is required. Merging or deploying does not create, fund, or reprice any markets.

The dashboard lists MNX-owned markets on registered MNX feeds, including unlisted
and resolved markets. Stats are refreshed from the database with **Refresh stats**:
backing, open interest, active traders, 24-hour margin volume, opening fees, and
oracle health. Fees are added to the backing pools. Stats cannot be manually edited.

To edit a market's title or description, open its market link while signed in
as MNX. Use the pencil beside the title or **Edit description** below the
description. Both are editable on MNX-owned markets; the oracle feed and ticker
remain fixed. Title editing requires the updated API deployment. Description
editing already uses the existing creator permissions. The launch audit accepts
custom MNX-owned titles while still checking the feed, ticker, and owner.

Select live markets, or use **Manage** on one market:

- **Add liquidity:** choose long, short, or both. The entered amount is **per
  market, per selected side**. For example, M$1,000 to both sides of 16 markets
  costs M$32,000. The signed-in account pays, including when that account is an
  admin. Contributions do not create withdrawable LP shares; remaining backing
  belongs to the market creator at settlement.
- **Trading rules:** change web/API opening fees, the size-impact coefficient,
  leverage cap, funding cap/sensitivity, or the maximum oracle mark age. Blank
  fields stay unchanged. Funding is entered as an annualized percentage and
  converted using each market's own funding period. API base fees cannot go
  below the web base. Lower leverage caps affect new opens/adds, and increases
  on MNX feeds require current provider support. Oracle age also gates closes
  and cannot be reduced below the feed's cadence floor.
- **Visibility:** choose Unlisted or Public in the bottom management panel,
  review each selected market's before/after visibility, then apply. Markets
  already at the chosen visibility are skipped. Public markets appear in search
  and on `/perps`; unlisted markets can still be accessed and traded through
  their links. This uses the existing creator/admin market-update API, so only
  the web deployment is needed for the visibility controls.

Review the market list, changes, and total contribution, then apply. Markets are
processed sequentially; a failure stops the batch and leaves earlier successes
in place. **Retry remaining** skips completed markets. The browser saves payment
request IDs before sending, and the backend recognizes those IDs under the
contract lock, so a timeout/reload can be retried without charging twice. A
restored batch never resumes automatically. Keep the saved batch until uncertain
results are reconciled; starting a new batch creates new payments. Each batch is
saved under its own browser entry, so **Finish batch** removes only that batch
and can never discard one that another tab is still applying. Other open tabs
show a batch while it is being applied and cannot retry or finish it until the
run ends, or about a minute after a tab was closed mid-run. Rule edits check the
previewed settings and record their audit history in the same database
transaction as the update.

New MNX-feed markets default to **10 bps web, 20 bps API, impact 10**. These are
opening fees on notional; 20 bps is 0.20%, plus the size-dependent fee. The impact
coefficient is not a flat 10% fee. Existing markets keep their settings until an
operator applies a change, such as **Use MNX fee preset** in the dashboard.

Creation remains in `backend/scripts/create-mnx-perps.ts`. The script now sends
these fees explicitly, checks the API's creation-fee capability before any write,
and verifies the fees and creator in each response. The MNX identity remains
pinned by environment in `common/src/perps/creator-accounts.ts` (re-exported from
the existing shared module); usernames do not grant management access. DEV stays
unconfigured until it has its own verified partner account.
