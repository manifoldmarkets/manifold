-- Speed up boost history lookups for cash-funded boosts without indexing all audit events.
create index concurrently if not exists audit_events_cash_boost_lookup_idx
  on public.audit_events using btree (
    user_id,
    ((data ->> 'boostId'::text)),
    created_time desc
  )
  where (
    name = any (
      array[
        'contract boost purchased'::text,
        'post boost purchased'::text
      ]
    )
  )
  and ((data ->> 'paymentMethod'::text) = 'cash'::text);
