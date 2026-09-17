# RPS poker

`/poker` is deliberately absent from navigation. The lobby always lists two permanent public rooms (M1 and M100 antes);
private links carry a 256-bit access token in the URL fragment. The browser stores
it in local storage (migrating older session storage) and removes the fragment; authorized POST reads carry it
in the body. The lobby can release the signed-in account’s own seat without the
invite; this grants no access to private reads or other actions. Only the hash is stored on the server. Treat the link as a capability.
The lobby/table pages skip our pageview event and do not initiate third-party
analytics scripts. Umami excludes URL fragments globally. Creation passes tokens
through browser storage or an in-memory fallback, never an SPA navigation URL.
When storage is blocked, keep the invitation for access after a reload.

**Analytics follow-up:** scripts loaded on another page survive SPA navigation.
The rich-text link renderer uses Next links for Manifold URLs, so an invitation
in a comment can take this path. Before launch, audit the deployed GTM container
`GTM-MLMPXHJ6`: exclude poker from automatic history/pageview tracking and ensure
click URL, page URL, and referrer variables never send invite fragments. Container
configuration is external to this repository; the app's route handler alone
cannot enforce this. Never put a private link in tracking events.

## Deployment

1. Apply `backend/supabase/migrations/2026091501_poker.sql` to the target database
   **before** deploying the API, scheduler, or mana-supply code. It adds tables;
   it does not change existing balances. Client roles have no direct access.
   Then apply `2026091701_permanent_poker_rooms.sql` before deploying this version.
   It seeds the two hostless public rooms, enforces one per ante, and queues legacy
   public tables for closure after their active hands settle. Paused hands stay
   paused for investigation. The API only allows users to create private rooms.
2. Deploy common/shared, API, scheduler, and web together. The main scheduler
   job set includes `advance-poker`, which checks durable deadlines every second.
   Routine scheduler metadata/logging is sampled once per minute; failure reporting
   and overlap protection still apply to every tick.
   Redis broadcasts are optional: two-second polling recovers missed notifications.
3. Exercise public/private games on dev with separate accounts before production.

Only private rooms can be created, with a configurable ante. Public antes are fixed at M1 and M100. The entry/resume requirement is
always 100× ante. A seat's `needs_minimum` stays false across continuous hands and
becomes true when sitting out or timing out. The balance is checked again at deal.
The host starts a private table once; subsequent hands auto-deal. Active trading
bans are checked again at every deal; banned players finish their current hand
and sit out before another ante is collected.

## Accounting and concurrency

Each mutation locks its table, then all relevant user rows in user-ID order.
Moves use `(handId, street)` as their version so simultaneous submissions don't
invalidate each other; structural actions use the table version. Idempotency keys
are bound to the user, table and action. Reuse them after uncertain responses.

The rules engine is pure. Round resolution checks locked live balances, downgrades
underfunded Rocks before counting them, then computes calls. Contributions, state,
ledger entries and wallet updates commit atomically. Payout/refund operations are
unique per hand/user and must drain escrow exactly. Public transaction rows contain
no table ID, hand ID, move, cards, or access secret. Private ledger rows associate
transactions with hands. Balances and total deposits move together so these
transactions don't change prediction-market profit or league performance.

All-in is permanent for the hand, including if the wallet receives funds later.
A zero-whole-mana actor at reveal becomes all-in for prior contributions. A positive
but underfunded Rock becomes Scissors and can still call (partially) if other Rocks
remain. Whole-mana arithmetic leaves fractional wallet balances untouched.

Voluntary departure uses `auto_paper` for subsequent unsubmitted moves; a host ban
only queues departure, allowing the player to finish choosing in their active hand.
An already accepted move is never changed by departure or moderation.
Public rooms have a null creator, stay open when emptied, and auto-deal whenever
two eligible players are ready. Site admins can mute/ban there but cannot close them.
If a private-table creator explicitly leaves, the table closes after the current hand settles
(or immediately between hands), releases all seats, and disappears from the public
lobby. Settled hand participants remain in results/history but only current seat
occupants are shown around the table.

## Operations

The admin-only `set-poker-enabled` endpoint sets the shared database switch:
`{ "enabled": false }` stops new tables/hands while existing hands can finish.
The equivalent SQL is:

```sql
update poker_settings
set
  new_hands_enabled = false
where
  id = true;
```

Re-enabling lets waiting tables resume. A restart resumes deadlines from Postgres;
it does not reshuffle existing hands. Monitor the existing API request/error metrics
and scheduler job status plus the `Poker table deadline overdue`, `Poker deadline
processing failed`, and `Poker hand paused` structured logs. SQL error logging is
redacted for poker to avoid exposing decks and moves.

An accounting invariant failure rolls back the action and marks the table paused.
Do not refund or pay it manually without reconciling the private ledger, users and
hand state. After repairing the cause, clear `paused` on that table to retry the
stored hand. The global switch does not resume individually paused tables.

Outstanding escrow can be audited without reading hidden cards:

```sql
select
  h.id,
  h.escrow,
  coalesce(
    sum(
      case
        when l.kind = 'contribution' then l.amount
        else - l.amount
      end
    ),
    0
  ) as ledger_balance
from
  poker_hands h
  left join poker_ledger l on l.hand_id = h.id
group by
  h.id
having
  h.escrow <> coalesce(
    sum(
      case
        when l.kind = 'contribution' then l.amount
        else - l.amount
      end
    ),
    0
  )
  or (
    h.settled
    and h.escrow <> 0
  );
```

## Tests

From the repository root:

```sh
yarn test:common poker/engine --runInBand
POKER_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/postgres yarn test:shared poker/service.integration --runInBand
yarn build:ci
yarn typecheck
```

Integration tests require a local PostgreSQL superuser connection. They create a
uniquely named test database, apply the actual migration, exercise real concurrent
transactions, and drop that database afterward. Without the environment variable
only that suite is skipped. Never point these tests at a shared/remote database.
