-- Track cumulative open/add taker fees per live position so user-facing PnL
-- can subtract the full cash a trader committed (margin + fees), not just
-- margin. The engine writes the column transactionally on every open/add.
--
-- DEPLOY ORDER (load-bearing): apply this migration BEFORE deploying an API
-- that includes the fee-basis code. That engine includes
-- taker_fee_cost_basis in every position upsert and NaN-checks it on read,
-- so running it against a table without the column fails closed on every
-- trade. The reverse order (column first, old API still running) is
-- harmless: the old writer leaves the default 0 and the backfill below can
-- be re-run once after the deploy — it is idempotent.
--
-- The backfill rebuilds the basis for positions opened by a fee-charging API
-- that predates the column (only dev ever ran one). It sums the open/add
-- fees recorded in the append-only event log since the position's current
-- lifecycle began (its latest 'open' event). On prod it is a no-op: no
-- fee-bearing events exist before the first post-migration deploy. Metrics
-- need no repair here — buildPerpUserContractMetrics recomputes a user's
-- totals from the full event log (fee-aware) on their next engine write.

begin;

alter table contract_perp_positions
  add column taker_fee_cost_basis numeric not null default 0
  check (taker_fee_cost_basis >= 0);

with latest_open as (
  select contract_id, user_id, direction, max(id) as open_id
  from contract_perp_events
  where event_type = 'open'
    and user_id is not null
    and direction in ('long', 'short')
  group by contract_id, user_id, direction
), fee_basis as (
  select
    e.contract_id,
    e.user_id,
    e.direction,
    coalesce(sum(
      case
        when e.event_type in ('open', 'add')
        then case
          when jsonb_typeof(e.data->'fee') = 'number'
          then greatest((e.data->>'fee')::numeric, 0)
          else 0
        end
        else 0
      end
    ), 0) as taker_fee_cost_basis
  from contract_perp_events e
  join latest_open o
    on o.contract_id = e.contract_id
    and o.user_id = e.user_id
    and o.direction = e.direction
    and e.id >= o.open_id
  group by e.contract_id, e.user_id, e.direction
)
update contract_perp_positions p
set taker_fee_cost_basis = f.taker_fee_cost_basis
from fee_basis f
where f.contract_id = p.contract_id
  and f.user_id = p.user_id
  and f.direction = p.direction;

commit;
