-- A client retry must never apply the same PERP balance mutation twice.
-- The authoritative event stores the request key and response snapshot; these
-- indexes make that key unique for each user, contract, and operation.
begin;

create unique index if not exists contract_perp_events_open_idempotency
  on contract_perp_events (
    contract_id,
    user_id,
    ((data ->> 'idempotencyKey'))
  )
  where
    user_id is not null
    and event_type in ('open', 'add')
    and data ? 'idempotencyKey';

create unique index if not exists contract_perp_events_close_idempotency
  on contract_perp_events (
    contract_id,
    user_id,
    ((data ->> 'idempotencyKey'))
  )
  where
    user_id is not null
    and event_type = 'close'
    and data ? 'idempotencyKey';

commit;
