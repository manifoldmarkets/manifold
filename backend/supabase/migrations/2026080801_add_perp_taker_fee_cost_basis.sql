begin;

alter table contract_perp_positions
  add column taker_fee_cost_basis numeric not null default 0
  check (taker_fee_cost_basis >= 0);

-- Keep fee basis correct while old and new API instances overlap during a
-- rolling deploy. Both versions append the fee to the event before commit;
-- rebuilding from the current lifecycle makes this trigger idempotent for the
-- new writer and fills the column for the old writer.
create or replace function reconcile_perp_position_taker_fee_basis()
returns trigger
language plpgsql
as $$
begin
  if new.event_type not in ('open', 'add')
    or new.user_id is null
    or new.direction is null
    or new.direction not in ('long', 'short') then
    return new;
  end if;

  update contract_perp_positions p
  set taker_fee_cost_basis = (
    select coalesce(sum(
      case
        when e.event_type in ('open', 'add')
        then case
          when jsonb_typeof(e.data->'fee') = 'number'
          then greatest((e.data->>'fee')::numeric, 0)
          else 0
        end
        else 0
      end
    ), 0)
    from contract_perp_events e
    where e.contract_id = new.contract_id
      and e.user_id = new.user_id
      and e.direction = new.direction
      and e.id >= (
        select max(open_event.id)
        from contract_perp_events open_event
        where open_event.contract_id = new.contract_id
          and open_event.user_id = new.user_id
          and open_event.direction = new.direction
          and open_event.event_type = 'open'
      )
  )
  where p.contract_id = new.contract_id
    and p.user_id = new.user_id
    and p.direction = new.direction;

  return new;
end;
$$;

drop trigger if exists contract_perp_events_reconcile_taker_fee_basis
  on contract_perp_events;
create trigger contract_perp_events_reconcile_taker_fee_basis
after insert on contract_perp_events
for each row execute function reconcile_perp_position_taker_fee_basis();

-- Existing live positions may already have paid opening/add fees. Rebuild the
-- basis from the current lifecycle, beginning at the latest open event for the
-- same contract, user, and direction. Malformed legacy event data contributes
-- zero rather than blocking the migration.
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

-- Lifetime metrics created by the fee-charging deployment predate this fix.
-- Recompute their canonical cash totals from the append-only event log so
-- already-closed traders do not need another trade to get corrected.
with event_totals as (
  select
    contract_id,
    user_id,
    coalesce(sum(
      case
        when event_type in ('open', 'add')
          and original_cost_basis_delta > 0
        then original_cost_basis_delta +
          case
            when jsonb_typeof(data->'fee') = 'number'
            then greatest((data->>'fee')::numeric, 0)
            else 0
          end
        else 0
      end
    ), 0) as invested,
    coalesce(sum(
      case
        when event_type in ('close', 'liquidation', 'adl')
        then case
          when jsonb_typeof(data->'payout') = 'number'
          then greatest((data->>'payout')::numeric, 0)
          else 0
        end
        else 0
      end
    ), 0) as sold
  from contract_perp_events
  where user_id is not null
    and event_type in ('open', 'add', 'close', 'liquidation', 'adl')
  group by contract_id, user_id
), rebuilt_metrics as (
  select
    m.id,
    totals.invested,
    totals.sold,
    case
      when jsonb_typeof(m.data->'payout') = 'number'
      then (m.data->>'payout')::numeric
      else 0
    end as current_value
  from user_contract_metrics m
  join event_totals totals
    on totals.contract_id = m.contract_id
    and totals.user_id = m.user_id
  where m.answer_id is null
), corrected_metrics as (
  select
    id,
    invested,
    sold,
    current_value + sold - invested as profit,
    case
      when invested > 0
      then ((current_value + sold - invested) / invested) * 100
      else 0
    end as profit_percent
  from rebuilt_metrics
)
update user_contract_metrics m
set
  data = m.data || jsonb_build_object(
    'invested', corrected.invested,
    'totalAmountInvested', corrected.invested,
    'totalAmountSold', corrected.sold,
    'profit', corrected.profit,
    'profitPercent', corrected.profit_percent
  ),
  profit = corrected.profit
from corrected_metrics corrected
where corrected.id = m.id;

commit;
