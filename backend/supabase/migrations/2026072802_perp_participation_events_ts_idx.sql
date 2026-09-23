-- Nightly DAU and topic-DAU jobs scan user-initiated perp actions by time.
-- Funding produces far more event rows and must not make those scans degrade
-- as the append-only event table grows.
create index concurrently if not exists contract_perp_events_participation_ts
  on contract_perp_events (ts desc)
  include (id, user_id, contract_id)
  where user_id is not null
    and event_type in ('open', 'add', 'close')
    and data ->> 'reason' is distinct from 'flip'
    and data ->> 'reason' is distinct from 'resolve-market';
